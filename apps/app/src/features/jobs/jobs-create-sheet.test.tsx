/* oxlint-disable vitest/prefer-import-in-mock */
import type {
  ContactIdType,
  RegionIdType,
  SiteIdType,
} from "@task-tracker/jobs-core";
import {
  SITE_NOT_FOUND_ERROR_TAG,
  SiteGeocodingFailedError,
} from "@task-tracker/jobs-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exit } from "effect";
import type { ComponentProps, ReactNode } from "react";

import { JobsCreateSheet } from "./jobs-create-sheet";
import { createJobMutationAtom, jobsOptionsStateAtom } from "./jobs-state";

type AsyncMutationMock = (...args: unknown[]) => Promise<unknown>;
type AtomSetterMock = (atom: unknown) => unknown;
type AtomValueMock = (atom: unknown) => unknown;
type NavigateMock = (...args: unknown[]) => unknown;

const depotSiteId = "11111111-1111-4111-8111-111111111111" as SiteIdType;
const schoolSiteId = "22222222-2222-4222-8222-222222222222" as SiteIdType;
const depotContactId = "33333333-3333-4333-8333-333333333333" as ContactIdType;
const northRegionId = "44444444-4444-4444-8444-444444444444" as RegionIdType;

const { mockedNavigate, mockedUseAtomSet, mockedUseAtomValue } = vi.hoisted(
  () => ({
    mockedNavigate: vi.fn<NavigateMock>(),
    mockedUseAtomSet: vi.fn<AtomSetterMock>(),
    mockedUseAtomValue: vi.fn<AtomValueMock>(),
  })
);

const mockedCreateJob = vi.fn<AsyncMutationMock>();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockedNavigate,
}));

vi.mock(import("@effect-atom/atom-react"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Result: {
      builder: () => ({
        onError: () => ({
          render: () => null,
        }),
        render: () => null,
      }),
    } as never,
    useAtomSet: mockedUseAtomSet as never,
    useAtomValue: mockedUseAtomValue as never,
  };
});

vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: (({ icon }: { icon?: unknown }) => (
    <span data-testid="hugeicon">{String(icon ?? "icon")}</span>
  )) as never,
}));

vi.mock("#/components/ui/alert", () => ({
  Alert: ({ children }: { children?: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("#/components/ui/badge", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("#/components/ui/button", () => ({
  Button: ({
    children,
    type,
    variant: _variant,
    size: _size,
    ...props
  }: ComponentProps<"button"> & {
    variant?: string;
    size?: string;
  }) => {
    if (type === "submit") {
      return (
        <button type="submit" {...props}>
          {children}
        </button>
      );
    }

    if (type === "reset") {
      return (
        <button type="reset" {...props}>
          {children}
        </button>
      );
    }

    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
  buttonVariants: () => "",
}));

vi.mock("#/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTrigger: ({ children, ...props }: ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("#/components/ui/field", () => ({
  FieldGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("#/components/ui/command", () => ({
  Command: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({
    children,
    heading,
  }: {
    children?: ReactNode;
    heading?: ReactNode;
  }) => (
    <div>
      {heading ? <div>{heading}</div> : null}
      {children}
    </div>
  ),
  CommandInput: ({
    onValueChange,
    ...props
  }: ComponentProps<"input"> & {
    onValueChange?: (value: string) => void;
  }) => (
    <input
      {...props}
      onChange={(event) => {
        props.onChange?.(event);
        onValueChange?.(event.currentTarget.value);
      }}
    />
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
    ...props
  }: ComponentProps<"button"> & {
    onSelect?: (value: string) => void;
    value?: string;
  }) => (
    <button
      type="button"
      onClick={() => onSelect?.(String(value ?? ""))}
      {...props}
    >
      {children}
    </button>
  ),
  CommandList: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandSeparator: () => null,
}));

vi.mock("#/components/ui/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("#/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({
    children,
    id,
    render: _render,
    ...props
  }: ComponentProps<"button"> & {
    children?: ReactNode;
    render?: unknown;
  }) => (
    <button type="button" id={id} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("#/components/ui/select", () => ({
  Select: (props: ComponentProps<"select">) => <select {...props} />,
}));

vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    open = true,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) =>
    open ? (
      <div data-testid="responsive-drawer" data-nested="false">
        {children}
      </div>
    ) : null,
  ResponsiveNestedDrawer: ({
    children,
    open = true,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) =>
    open ? (
      <div data-testid="responsive-drawer" data-nested="true">
        {children}
      </div>
    ) : null,
}));

vi.mock("#/components/ui/drawer", () => ({
  DrawerContent: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerFooter: ({ children }: { children?: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DrawerHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("#/features/auth/auth-form-field", () => ({
  AuthFormField: ({
    children,
    descriptionText,
    errorText,
    htmlFor,
    label,
  }: {
    children?: ReactNode;
    descriptionText?: ReactNode;
    errorText?: string;
    htmlFor: string;
    label: string;
  }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {descriptionText ? <p>{descriptionText}</p> : null}
      {errorText ? <p>{errorText}</p> : null}
    </div>
  ),
}));

async function choosePickerOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionLabel: string
) {
  await user.click(screen.getByLabelText(label));
  await user.click(screen.getByRole("button", { name: optionLabel }));
}

async function createInlineContact(
  user: ReturnType<typeof userEvent.setup>,
  contactName: string
) {
  await user.click(screen.getByLabelText("Contact"));
  await user.type(screen.getByPlaceholderText("Contact"), contactName);
  await user.click(
    screen.getByRole("button", {
      name: `Create new contact: "${contactName}"`,
    })
  );
}

function getResponsiveDrawerForHeading(name: string) {
  const heading = screen.getByRole("heading", { name });
  const drawer = heading.closest('[data-testid="responsive-drawer"]');

  expect(drawer).not.toBeNull();

  return drawer as HTMLElement;
}

describe("jobs create sheet", () => {
  beforeEach(() => {
    mockedNavigate.mockReset();
    mockedCreateJob.mockReset();

    mockedUseAtomSet.mockImplementation((atom: unknown) => {
      if (atom === createJobMutationAtom) {
        return mockedCreateJob;
      }

      return vi.fn<NavigateMock>();
    });

    mockedUseAtomValue.mockImplementation((atom: unknown) => {
      if (atom === createJobMutationAtom) {
        return {
          waiting: false,
        };
      }

      if (atom === jobsOptionsStateAtom) {
        return {
          data: {
            contacts: [
              {
                id: depotContactId,
                name: "Pat Contact",
                siteIds: [depotSiteId],
              },
            ],
            members: [],
            regions: [
              {
                id: northRegionId,
                name: "North",
              },
            ],
            sites: [
              {
                country: "IE",
                id: depotSiteId,
                name: "Depot",
                regionId: undefined,
                regionName: undefined,
              },
              {
                country: "IE",
                id: schoolSiteId,
                name: "School",
                regionId: undefined,
                regionName: undefined,
              },
            ],
          },
          organizationId: "org_123",
        };
      }

      return null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "submits existing site and contact selections with the chosen priority",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateJob.mockResolvedValue(Exit.succeed({ title: "Fix boiler" }));

      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await user.type(screen.getByLabelText("Title"), "Fix boiler");
      await choosePickerOption(user, "Priority", "High");
      await choosePickerOption(user, "Site", "Depot");
      await choosePickerOption(user, "Contact", "Pat Contact");
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(mockedCreateJob).toHaveBeenCalledWith({
        contact: {
          kind: "existing",
          contactId: depotContactId,
        },
        priority: "high",
        site: {
          kind: "existing",
          siteId: depotSiteId,
        },
        title: "Fix boiler",
      });
      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/jobs" });
    }
  );

  it(
    "supports inline site and contact creation with the minimal intake payload",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateJob.mockResolvedValue(
        Exit.succeed({ title: "Replace sensor" })
      );

      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await user.type(screen.getByLabelText("Title"), "Replace sensor");
      await choosePickerOption(user, "Site", "Create a new site");
      await user.type(screen.getByLabelText("Site name"), "Warehouse");
      await user.type(screen.getByLabelText("Address line 1"), "Unit 4");
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D04 X2X2");
      await user.click(screen.getByRole("button", { name: "Done" }));
      await createInlineContact(user, "Alex Caller");
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(mockedCreateJob).toHaveBeenCalledWith({
        contact: {
          kind: "create",
          input: {
            name: "Alex Caller",
          },
        },
        priority: undefined,
        site: {
          kind: "create",
          input: {
            accessNotes: undefined,
            addressLine1: "Unit 4",
            addressLine2: undefined,
            county: "Dublin",
            country: "IE",
            eircode: "D04 X2X2",
            name: "Warehouse",
            regionId: undefined,
            town: undefined,
          },
        },
        title: "Replace sensor",
      });
    }
  );

  it(
    "renders inline site details as a nested drawer",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await choosePickerOption(user, "Site", "Create a new site");

      const siteDrawer = getResponsiveDrawerForHeading("New site");
      expect(siteDrawer).toHaveAttribute("data-nested", "true");
      expect(
        within(siteDrawer).getByLabelText("Address line 1")
      ).toBeInTheDocument();
      expect(within(siteDrawer).getByLabelText("County")).toBeInTheDocument();
      expect(within(siteDrawer).getByLabelText("Eircode")).toBeInTheDocument();
      expect(
        within(siteDrawer).queryByRole("button", { name: /edit location/i })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "shows the inline site summary only after site details are drafted",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await choosePickerOption(user, "Site", "Create a new site");

      expect(
        screen.queryByText("Name, region, and location")
      ).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("Site name"), "Warehouse");

      expect(screen.getByText("Warehouse")).toBeInTheDocument();
    }
  );

  it("hides empty existing groups and no-contact clearing actions", async () => {
    mockedUseAtomValue.mockImplementation((atom: unknown) => {
      if (atom === createJobMutationAtom) {
        return {
          waiting: false,
        };
      }

      if (atom === jobsOptionsStateAtom) {
        return {
          data: {
            contacts: [],
            members: [],
            regions: [],
            sites: [],
          },
          organizationId: "org_123",
        };
      }

      return null;
    });

    const user = userEvent.setup();
    render(<JobsCreateSheet />);

    await user.click(screen.getByLabelText("Site"));

    expect(screen.queryByText("Existing sites")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "No site yet" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new site" })
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Contact"));

    expect(
      screen.queryByRole("button", { name: "No contact yet" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create a new contact" })
    ).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Contact"), "Alex Caller");
    expect(
      screen.getByRole("button", {
        name: 'Create new contact: "Alex Caller"',
      })
    ).toBeInTheDocument();
  }, 10_000);

  it(
    "includes optional site address data in the inline create payload",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateJob.mockResolvedValue(
        Exit.succeed({ title: "Trace intermittent fault" })
      );

      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await user.type(
        screen.getByLabelText("Title"),
        "Trace intermittent fault"
      );
      await choosePickerOption(user, "Site", "Create a new site");
      await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
      await choosePickerOption(user, "Region", "North");
      await user.type(
        screen.getByLabelText("Address line 1"),
        "1 Custom House Quay"
      );
      await user.type(screen.getByLabelText("Town"), "Dublin");
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D01 X2X2");
      await user.type(
        screen.getByLabelText("Access notes"),
        "Use reception and the south gate."
      );
      await user.click(
        within(getResponsiveDrawerForHeading("New site")).getByRole("button", {
          name: "Done",
        })
      );
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(mockedCreateJob).toHaveBeenCalledWith({
        contact: undefined,
        priority: undefined,
        site: {
          kind: "create",
          input: {
            accessNotes: "Use reception and the south gate.",
            addressLine1: "1 Custom House Quay",
            addressLine2: undefined,
            county: "Dublin",
            country: "IE",
            eircode: "D01 X2X2",
            name: "Docklands Campus",
            regionId: northRegionId,
            town: "Dublin",
          },
        },
        title: "Trace intermittent fault",
      });
    }
  );

  it(
    "shows validation errors when the minimal required intake fields are missing",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await choosePickerOption(user, "Site", "Create a new site");
      await user.click(screen.getByRole("button", { name: "Done" }));
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(
        screen.getByText(/give the job a clear title before you create it/i)
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/add the site name or pick an existing site/i)
      ).toHaveLength(2);
      expect(screen.getByText("Add address line 1.")).toBeInTheDocument();
      expect(screen.getByText("Add county.")).toBeInTheDocument();
      expect(screen.getByText("Add Eircode.")).toBeInTheDocument();
      expect(mockedCreateJob).not.toHaveBeenCalled();
    }
  );

  it(
    "clears inline site validation errors when an existing site is selected",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await choosePickerOption(user, "Site", "Create a new site");
      await user.click(screen.getByRole("button", { name: "Done" }));
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(
        screen.getAllByText(/add the site name or pick an existing site/i)
      ).toHaveLength(2);
      expect(screen.getByText("Add address line 1.")).toBeInTheDocument();
      expect(screen.getByText("Add county.")).toBeInTheDocument();
      expect(screen.getByText("Add Eircode.")).toBeInTheDocument();

      await choosePickerOption(user, "Site", "Depot");

      expect(
        screen.queryByText(/add the site name or pick an existing site/i)
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Add address line 1.")).not.toBeInTheDocument();
      expect(screen.queryByText("Add county.")).not.toBeInTheDocument();
      expect(screen.queryByText("Add Eircode.")).not.toBeInTheDocument();
    }
  );

  it(
    "surfaces a missing site error returned by the mutation",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateJob.mockResolvedValue(
        Exit.fail({
          _tag: SITE_NOT_FOUND_ERROR_TAG,
          message: "Missing site",
          siteId: depotSiteId,
        })
      );

      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await user.type(screen.getByLabelText("Title"), "Fix boiler");
      await choosePickerOption(user, "Site", "Depot");
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(
        screen.getByText(
          /that site is no longer available\. pick another one\./i
        )
      ).toBeInTheDocument();
    }
  );

  it(
    "clears stale existing-site errors when switching to inline site creation",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateJob.mockResolvedValue(
        Exit.fail({
          _tag: SITE_NOT_FOUND_ERROR_TAG,
          message: "Missing site",
          siteId: depotSiteId,
        })
      );

      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await user.type(screen.getByLabelText("Title"), "Fix boiler");
      await choosePickerOption(user, "Site", "Depot");
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(
        screen.getByText(
          /that site is no longer available\. pick another one\./i
        )
      ).toBeInTheDocument();

      await choosePickerOption(user, "Site", "Create a new site");

      const siteDrawer = getResponsiveDrawerForHeading("New site");
      expect(
        within(siteDrawer).queryByText(
          /that site is no longer available\. pick another one\./i
        )
      ).not.toBeInTheDocument();
    }
  );

  it(
    "reopens inline site details when geocoding fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateJob.mockResolvedValue(
        Exit.fail(
          new SiteGeocodingFailedError({
            country: "IE",
            eircode: "D04 X2X2",
            message:
              "We could not locate that site address. Check the Eircode and address details.",
          })
        )
      );

      const user = userEvent.setup();
      render(<JobsCreateSheet />);

      await user.type(screen.getByLabelText("Title"), "Replace sensor");
      await choosePickerOption(user, "Site", "Create a new site");
      await user.type(screen.getByLabelText("Site name"), "Warehouse");
      await user.type(screen.getByLabelText("Address line 1"), "Unit 4");
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D04 X2X2");
      await user.click(screen.getByRole("button", { name: "Done" }));
      await user.click(screen.getByRole("button", { name: /create job/i }));

      const siteDrawer = getResponsiveDrawerForHeading("New site");
      const eircodeField = within(siteDrawer).getByLabelText("Eircode");

      expect(
        within(siteDrawer).getByText(
          "We could not locate that site address. Check the Eircode and address details."
        )
      ).toBeInTheDocument();
      expect(eircodeField).toHaveAttribute("aria-invalid", "true");
    }
  );
});
