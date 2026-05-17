import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  JobCollaborator,
  JobCollaboratorIdType,
  JobDetailResponse,
  UserIdType,
  VisitIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { SiteIdType, SiteOption } from "@ceird/sites-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exit } from "effect";
import type { ComponentProps, ReactNode } from "react";

import { CommandBarProvider } from "#/features/command-bar/command-bar";

import { JobsDetailSheet } from "./jobs-detail-sheet";
import type { JobsAsyncResult } from "./jobs-state";
import type { JobsViewer } from "./jobs-viewer";

type AsyncMutationMock = (...args: unknown[]) => Promise<unknown>;
type NavigateMock = (...args: unknown[]) => unknown;
type AppHotkeyMock = (...args: unknown[]) => void;

const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const actorUserId = "22222222-2222-4222-8222-222222222222" as UserIdType;
const externalUserId = "12121212-1212-4121-8121-121212121212" as UserIdType;
const secondExternalUserId =
  "45454545-4545-4454-8454-454545454545" as UserIdType;
const collaboratorId =
  "23232323-2323-4232-8232-232323232323" as JobCollaboratorIdType;
const contactId = "34343434-3434-4343-8343-343434343434" as ContactIdType;
const urgentLabelId = "99999999-9999-4999-8999-999999999999" as LabelIdType;
const accessLabelId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as LabelIdType;
const waitingLabelId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as LabelIdType;

const {
  mockedGetExternalMemberOptions,
  mockedNavigate,
  mockedUseAppHotkey,
  mockedUseJobsDetailState,
  responsiveDrawerPropsRef,
} = vi.hoisted(() => ({
  mockedGetExternalMemberOptions: vi.fn<() => Promise<unknown>>(),
  mockedNavigate: vi.fn<NavigateMock>(),
  mockedUseAppHotkey: vi.fn<AppHotkeyMock>(),
  mockedUseJobsDetailState: vi.fn<() => unknown>(),
  responsiveDrawerPropsRef: {
    current: null as null | {
      onAnimationEnd?: (open: boolean) => void;
      onOpenChange?: (open: boolean) => void;
      open?: boolean;
    },
  },
}));

const mockedTransitionJob = vi.fn<AsyncMutationMock>();
const mockedReopenJob = vi.fn<AsyncMutationMock>();
const mockedPatchJob = vi.fn<AsyncMutationMock>();
const mockedAddComment = vi.fn<AsyncMutationMock>();
const mockedAddVisit = vi.fn<AsyncMutationMock>();
const mockedAssignLabel = vi.fn<AsyncMutationMock>();
const mockedAttachCollaborator = vi.fn<AsyncMutationMock>();
const mockedCreateAndAssignLabel = vi.fn<AsyncMutationMock>();
const mockedDetachCollaborator = vi.fn<AsyncMutationMock>();
const mockedRemoveLabel = vi.fn<AsyncMutationMock>();
const mockedRefreshCollaborators = vi.fn<AsyncMutationMock>();
const mockedAddCostLine = vi.fn<AsyncMutationMock>();
const mockedUpdateCollaborator = vi.fn<AsyncMutationMock>();
let lookupSiteById: Map<SiteIdType, SiteOption>;
let collaboratorState: readonly JobCollaborator[];

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockedNavigate,
}));

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
    loading: _loading,
    type,
    variant: _variant,
    size: _size,
    className: _className,
    ...props
  }: ComponentProps<"button"> & {
    loading?: boolean;
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

vi.mock("#/components/ui/card", () => ({
  Card: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  CardContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CardDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  CardHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  CardTitle: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("#/components/ui/command-select", () => ({
  CommandSelect: ({
    ariaInvalid: _ariaInvalid,
    emptyText: _emptyText,
    groups,
    id,
    onValueChange,
    placeholder: _placeholder,
    searchPlaceholder: _searchPlaceholder,
    value,
    ...props
  }: ComponentProps<"select"> & {
    ariaInvalid?: boolean;
    emptyText?: string;
    groups: readonly {
      readonly options: readonly {
        readonly label: string;
        readonly value: string;
      }[];
    }[];
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      {...props}
    >
      {groups.flatMap((group) =>
        group.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))
      )}
    </select>
  ),
}));

vi.mock("#/components/ui/empty", () => ({
  Empty: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  EmptyHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  EmptyTitle: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

vi.mock("#/components/ui/field", () => ({
  Field: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  FieldContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  FieldDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  FieldError: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  FieldGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  FieldLabel: ({
    children,
    htmlFor,
  }: {
    children?: ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("#/components/ui/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("#/components/ui/select", () => ({
  Select: (props: ComponentProps<"select">) => <select {...props} />,
}));

vi.mock("#/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    open = true,
    onAnimationEnd,
    onOpenChange,
  }: {
    children?: ReactNode;
    onAnimationEnd?: (open: boolean) => void;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) => {
    responsiveDrawerPropsRef.current = { onAnimationEnd, onOpenChange, open };

    return <div data-testid="responsive-drawer">{children}</div>;
  },
}));

vi.mock("#/components/ui/drawer", () => ({
  DRAWER_CLOSE_FALLBACK_MS: 550,
  DrawerClose: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerFooter: ({ children }: { children?: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DrawerHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
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

vi.mock("#/components/ui/textarea", () => ({
  Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

vi.mock("#/hotkeys/use-app-hotkey", () => ({
  useAppHotkey: mockedUseAppHotkey,
}));

vi.mock("./jobs-server", () => ({
  getCurrentServerJobExternalMemberOptions: mockedGetExternalMemberOptions,
}));

vi.mock("./jobs-detail-state", () => ({
  JobsDetailStateProvider: ({
    children,
  }: {
    readonly children?: ReactNode;
  }) => <>{children}</>,
  useJobsDetailState: mockedUseJobsDetailState,
}));

vi.mock("./jobs-state", () => ({
  getJobsAsyncErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong.",
  isJobsAsyncFailure: (result: JobsAsyncResult) => result.error !== null,
  useJobsLookup: () => ({
    contactById: new Map(),
    labelById: new Map([
      [
        urgentLabelId,
        {
          createdAt: "2026-04-23T09:00:00.000Z",
          id: urgentLabelId,
          name: "Urgent callout",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
      ],
      [
        accessLabelId,
        {
          createdAt: "2026-04-23T09:05:00.000Z",
          id: accessLabelId,
          name: "Access",
          updatedAt: "2026-04-23T09:05:00.000Z",
        },
      ],
      [
        waitingLabelId,
        {
          createdAt: "2026-04-23T09:10:00.000Z",
          id: waitingLabelId,
          name: "Waiting on PO",
          updatedAt: "2026-04-23T09:10:00.000Z",
        },
      ],
    ]),
    memberById: new Map([[actorUserId, { name: "Taylor Owner" }]]),
    serviceAreaById: new Map(),
    siteById: lookupSiteById,
  }),
}));

vi.mock("#/features/sites/site-location-map-preview-canvas", () => ({
  SiteLocationMapPreviewCanvas: () => (
    <div data-testid="location-map-preview" />
  ),
}));

describe("jobs detail sheet", () => {
  beforeEach(() => {
    lookupSiteById = new Map([[siteId, buildSiteOption()]]);
    collaboratorState = [];
    responsiveDrawerPropsRef.current = null;

    mockedNavigate.mockReset();
    mockedUseJobsDetailState.mockReset();
    mockedAttachCollaborator.mockReset();
    mockedTransitionJob.mockReset();
    mockedDetachCollaborator.mockReset();
    mockedReopenJob.mockReset();
    mockedPatchJob.mockReset();
    mockedAddComment.mockReset();
    mockedAddVisit.mockReset();
    mockedAssignLabel.mockReset();
    mockedCreateAndAssignLabel.mockReset();
    mockedRemoveLabel.mockReset();
    mockedAddCostLine.mockReset();
    mockedGetExternalMemberOptions.mockReset();
    mockedRefreshCollaborators.mockReset();
    mockedUpdateCollaborator.mockReset();
    mockedUseAppHotkey.mockReset();
    mockedGetExternalMemberOptions.mockResolvedValue({
      members: [
        {
          email: "external@example.com",
          id: externalUserId,
          name: "External Partner",
        },
        {
          email: "requester@example.com",
          id: secondExternalUserId,
          name: "Job Requester",
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders job sub-surfaces as one stacked briefing", () => {
    renderDetailSheet(buildDetail());

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Site" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Job details" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Comments" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visits" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Activity" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Workflow" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Costs" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Site" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Comment 1" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cost" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visit 1" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collaborator" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Keep the status honest. Use blocked only when something is truly waiting on an unblock."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Give dispatch the site context and the fastest way into navigation."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Useful details for the person or organization connected to this work."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Move this job onto an existing site when the location becomes clear."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Changing the site clears the linked contact so it cannot point at the wrong place."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Share this job with external people without making them internal members."
      )
    ).not.toBeInTheDocument();
    for (const removedCopy of [
      "Keep the narrative in comments instead of hiding it in fields.",
      "Capture the detail the next person will actually need.",
      "The job is ready for its first bit of real context.",
      "Track labour and materials without mixing them into the job narrative.",
      "Keep it short: what was used or what work was carried out.",
      "Add labour or materials once the work creates a real cost.",
      "Log the site visits that explain the real effort behind the work.",
      "Keep it short and concrete: what happened, what changed, what is next.",
      "Add the field work once the crew starts showing up on site.",
      "System activity stays separate from narrative comments.",
      "The history will fill in as the job moves.",
      "Job details, comments, costs, visits, and activity.",
      "Optional reference from outside this workspace",
      "Add one when there is a clear related person or organization.",
      "Attach an external member when this job needs limited shared visibility.",
    ]) {
      expect(screen.queryByText(removedCopy)).not.toBeInTheDocument();
    }
  });

  it("waits for the drawer close animation before leaving the route", () => {
    vi.useFakeTimers();
    try {
      renderDetailSheet(buildDetail());

      expect(responsiveDrawerPropsRef.current?.open).toBeTruthy();

      act(() => {
        responsiveDrawerPropsRef.current?.onOpenChange?.(false);
      });

      expect(mockedNavigate).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(549);
      });

      expect(mockedNavigate).not.toHaveBeenCalled();

      act(() => {
        responsiveDrawerPropsRef.current?.onAnimationEnd?.(false);
      });

      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/jobs" });
    } finally {
      vi.useRealTimers();
    }
  });

  it(
    "renders the initial detail, comments, visits, and activity thread",
    {
      timeout: 10_000,
    },
    () => {
      renderDetailSheet(buildDetail());

      expect(
        screen.getByRole("heading", { name: "Inspect boiler" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("Checked the burner and reset the controls.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("pat@example.com · +353 87 765 4321")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Replaced faulty relay and tested startup.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Taylor Owner created the job.")
      ).toBeInTheDocument();
      expect(screen.getByText("Urgent callout")).toBeInTheDocument();
      expect(screen.getAllByText("Docklands Campus").length).toBeGreaterThan(0);
      expect(
        screen.getByText("1 Custom House Quay, North Dock")
      ).toBeInTheDocument();
      expect(screen.getByText("Dublin, Dublin, D01 X2X2")).toBeInTheDocument();
      expect(
        screen.getByText("Use the south gate and ring reception.")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /view on map/i })
      ).toHaveAttribute(
        "href",
        "https://www.google.com/maps/search/?api=1&query=53.3498%2C-6.2603"
      );
    }
  );

  it(
    "renders detail site when site options are empty",
    {
      timeout: 10_000,
    },
    () => {
      lookupSiteById = new Map();

      renderDetailSheet(buildDetail({ site: buildSiteOption() }));

      expect(screen.getAllByText("Docklands Campus").length).toBeGreaterThan(0);
      expect(
        screen.getByText("1 Custom House Quay, North Dock")
      ).toBeInTheDocument();
      expect(screen.queryByText("No site yet")).not.toBeInTheDocument();
    }
  );

  it(
    "assigns an existing organization label from the detail picker",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAssignLabel.mockResolvedValue(Exit.succeed(buildDetail()));

      const user = userEvent.setup();
      renderDetailSheet(buildDetail());

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.click(screen.getByRole("option", { name: "Access" }));

      expect(mockedAssignLabel).toHaveBeenCalledWith({
        labelId: accessLabelId,
      });
    }
  );

  it(
    "creates and assigns a new organization label from the detail picker",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateAndAssignLabel.mockResolvedValue(Exit.succeed(buildDetail()));

      const user = userEvent.setup();
      renderDetailSheet(buildDetail());

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.type(screen.getByPlaceholderText("Search labels"), "Warranty");
      await user.click(
        screen.getByRole("option", {
          name: 'Create new label: "Warranty"',
        })
      );

      expect(mockedCreateAndAssignLabel).toHaveBeenCalledWith({
        name: "Warranty",
      });
    }
  );

  it(
    "does not offer invalid label names for inline creation",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderDetailSheet(buildDetail());

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.type(
        screen.getByPlaceholderText("Search labels"),
        "x".repeat(49)
      );

      expect(
        screen.queryByRole("option", {
          name: `Create new label: "${"x".repeat(49)}"`,
        })
      ).not.toBeInTheDocument();
      expect(mockedCreateAndAssignLabel).not.toHaveBeenCalled();
    }
  );

  it(
    "removes an assigned label from the detail header",
    {
      timeout: 10_000,
    },
    async () => {
      mockedRemoveLabel.mockResolvedValue(Exit.succeed(buildDetail()));

      const user = userEvent.setup();
      renderDetailSheet(buildDetail());

      await user.click(
        screen.getByRole("button", {
          name: /remove urgent callout label/i,
        })
      );

      expect(mockedRemoveLabel).toHaveBeenCalledWith(urgentLabelId);
    }
  );

  it(
    "lets elevated users assign and remove labels even when they are not assigned",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAssignLabel.mockResolvedValue(Exit.succeed(buildDetail()));
      mockedRemoveLabel.mockResolvedValue(Exit.succeed(buildDetail()));

      const user = userEvent.setup();
      renderDetailSheet(buildDetail(), {
        role: "admin",
        userId: "99999999-9999-4999-8999-999999999999" as UserIdType,
      });

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.click(screen.getByRole("option", { name: "Access" }));
      await user.click(
        screen.getByRole("button", {
          name: /remove urgent callout label/i,
        })
      );

      expect(mockedAssignLabel).toHaveBeenCalledWith({
        labelId: accessLabelId,
      });
      expect(mockedRemoveLabel).toHaveBeenCalledWith(urgentLabelId);
    }
  );

  it(
    "lets assigned members assign and remove existing labels without creating labels",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAssignLabel.mockResolvedValue(Exit.succeed(buildDetail()));
      mockedRemoveLabel.mockResolvedValue(Exit.succeed(buildDetail()));

      const user = userEvent.setup();
      renderDetailSheet(buildDetail(), {
        role: "member",
        userId: actorUserId,
      });

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.type(screen.getByPlaceholderText("Search labels"), "Warranty");

      expect(
        screen.queryByRole("option", {
          name: 'Create new label: "Warranty"',
        })
      ).not.toBeInTheDocument();

      await user.clear(screen.getByPlaceholderText("Search labels"));
      await user.click(screen.getByRole("option", { name: "Access" }));
      await user.click(
        screen.getByRole("button", {
          name: /remove urgent callout label/i,
        })
      );

      expect(mockedAssignLabel).toHaveBeenCalledWith({
        labelId: accessLabelId,
      });
      expect(mockedRemoveLabel).toHaveBeenCalledWith(urgentLabelId);
      expect(mockedCreateAndAssignLabel).not.toHaveBeenCalled();
    }
  );

  it(
    "does not offer duplicate label creation when whitespace-normalized names match",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderDetailSheet(
        buildDetail({
          labels: [buildLabel(waitingLabelId, "Waiting on PO")],
        })
      );

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.type(
        screen.getByPlaceholderText("Search labels"),
        "Waiting  on PO"
      );

      expect(
        screen.queryByRole("option", {
          name: 'Create new label: "Waiting  on PO"',
        })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "renders a lazy location map preview when coordinates are available",
    {
      timeout: 10_000,
    },
    async () => {
      Object.defineProperty(window.URL, "createObjectURL", {
        configurable: true,
        value: vi.fn<() => string>(),
      });

      renderDetailSheet(buildDetail());

      await expect(
        screen.findByTestId("location-map-preview")
      ).resolves.toBeInTheDocument();
    }
  );

  it(
    "renders an explicit empty location state when the job has no site yet",
    {
      timeout: 10_000,
    },
    () => {
      renderDetailSheet(buildDetail({ siteId: undefined }));

      expect(screen.getByText("No site attached yet.")).toBeInTheDocument();
      expect(
        screen.getByText(
          /it will not show up on the map until a site is added/i
        )
      ).toBeInTheDocument();
    }
  );

  it(
    "requires a blocked reason before moving an in-progress job to blocked",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderDetailSheet(buildDetail());
      await openJobDetailTab(user, /status/i);

      await user.selectOptions(screen.getByLabelText("Next status"), "blocked");
      await user.click(
        screen.getByRole("button", { name: /apply status change/i })
      );

      expect(
        screen.getByText(
          /add the blocker so the next person knows what is stuck/i
        )
      ).toBeInTheDocument();
      expect(mockedTransitionJob).not.toHaveBeenCalled();
    }
  );

  it(
    "does not offer completed as a direct next step for blocked jobs",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderDetailSheet(buildDetail({ status: "blocked" }));
      await openJobDetailTab(user, /status/i);

      const statusSelect = screen.getByLabelText("Next status");

      expect(
        screen.getByRole("option", { name: "In progress" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Canceled" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Completed" })
      ).not.toBeInTheDocument();
      expect(statusSelect).toHaveValue("");
    }
  );

  it(
    "submits a comment and clears the composer",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddComment.mockResolvedValue(
        Exit.succeed({
          authorUserId: actorUserId,
          body: "Need a follow-up inspection.",
          createdAt: "2026-04-23T12:00:00.000Z",
          id: "44444444-4444-4444-8444-444444444444" as CommentIdType,
          workItemId,
        })
      );

      const user = userEvent.setup();
      renderDetailSheet(buildDetail());
      await openJobDetailTab(user, /comments/i);

      const commentField = screen.getByLabelText("Add a comment");
      await user.type(commentField, "Need a follow-up inspection.");
      await user.click(screen.getByRole("button", { name: /add comment/i }));

      expect(mockedAddComment).toHaveBeenCalledWith({
        body: "Need a follow-up inspection.",
      });
      expect(commentField).toHaveValue("");
    }
  );

  it(
    "registers job detail transition actions in the command bar",
    {
      timeout: 10_000,
    },
    async () => {
      mockedTransitionJob.mockResolvedValue(
        Exit.succeed({
          ...buildDetail().job,
          status: "completed",
        })
      );

      const user = userEvent.setup();
      renderDetailSheet(buildDetail(), undefined, { withCommandBar: true });

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /mark job completed/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("option", { name: /mark job completed/i })
      );

      expect(mockedTransitionJob).toHaveBeenCalledWith({
        status: "completed",
      });
    }
  );

  it(
    "opens the workflow panel when the blocked command needs a reason",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderDetailSheet(buildDetail(), undefined, { withCommandBar: true });

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /prepare blocked status/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("option", { name: /prepare blocked status/i })
      );

      expect(screen.getByLabelText("Why is it blocked?")).toBeInTheDocument();
      expect(screen.getByLabelText("Next status")).toHaveValue("blocked");
      expect(mockedTransitionJob).not.toHaveBeenCalled();
    }
  );

  it("registers the cost hotkey only when the viewer can add costs", () => {
    renderDetailSheet(buildDetail(), {
      role: "member",
      userId: actorUserId,
    });

    expect(mockedUseAppHotkey).toHaveBeenCalledWith(
      "jobDetailCost",
      expect.any(Function),
      { enabled: true }
    );

    mockedUseAppHotkey.mockClear();

    renderDetailSheet(buildDetail(), {
      role: "member",
      userId: "99999999-9999-4999-8999-999999999999" as UserIdType,
    });

    expect(mockedUseAppHotkey).toHaveBeenCalledWith(
      "jobDetailCost",
      expect.any(Function),
      { enabled: false }
    );
  }, 1000);

  it("does not render a zero cost total when costs are omitted", async () => {
    const user = userEvent.setup();
    renderDetailSheet(buildDetail({ costs: undefined }));
    await openJobDetailTab(user, /costs/i);

    expect(screen.queryByText("Cost total")).not.toBeInTheDocument();
    expect(screen.queryByText("€0.00")).not.toBeInTheDocument();
    expect(
      screen.getByText("Cost details are not available here.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add cost line/i })
    ).not.toBeInTheDocument();
  }, 1000);

  it("renders assigned external collaborator details as read-only when comments are disabled", () => {
    renderDetailSheet(
      buildDetail({
        costs: undefined,
        viewerAccess: {
          canComment: false,
          visibility: "external",
        },
      }),
      {
        role: "external",
        userId: actorUserId,
      }
    );

    expect(screen.getByText("Inspect boiler")).toBeInTheDocument();
    expect(
      screen.getByText("Checked the burner and reset the controls.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add comment/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /apply status change/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /log visit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add cost line/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^visit\b/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^cost\b/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Taylor Owner created the job.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add label/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save site/i })
    ).not.toBeInTheDocument();
  }, 1000);

  it(
    "renders comment composer and attribution for an assigned external collaborator",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddComment.mockResolvedValue(
        Exit.succeed({
          authorName: "External Partner",
          authorUserId: externalUserId,
          body: "I can be there at 9.",
          createdAt: "2026-04-23T12:00:00.000Z",
          id: "44444444-4444-4444-8444-444444444444" as CommentIdType,
          workItemId,
        })
      );

      const user = userEvent.setup();
      renderDetailSheet(
        buildDetail({
          comments: [
            {
              authorName: "External Partner",
              authorUserId: externalUserId,
              body: "I can meet the technician at reception.",
              createdAt: "2026-04-23T11:00:00.000Z",
              id: "77777777-7777-4777-8777-777777777777" as CommentIdType,
              workItemId,
            },
          ],
          costs: undefined,
          viewerAccess: {
            canComment: true,
            visibility: "external",
          },
        }),
        {
          role: "external",
          userId: externalUserId,
        }
      );
      await openJobDetailTab(user, /comments/i);

      expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
      expect(screen.getByText("External Partner")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /apply status change/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /log visit/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /add cost line/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /add label/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /save site/i })
      ).not.toBeInTheDocument();

      await user.type(
        screen.getByLabelText("Add a comment"),
        "  I can be there at 9.  "
      );
      await user.click(screen.getByRole("button", { name: /add comment/i }));

      expect(mockedAddComment).toHaveBeenCalledWith({
        body: "I can be there at 9.",
      });
    }
  );

  it(
    "lets admins attach, update, and remove job collaborators",
    {
      timeout: 10_000,
    },
    async () => {
      collaboratorState = [buildCollaborator()];
      mockedAttachCollaborator.mockResolvedValue(
        Exit.succeed(
          buildCollaborator({
            id: "45454545-4545-4454-8454-454545454545" as JobCollaboratorIdType,
            roleLabel: "Tenant contact",
          })
        )
      );
      mockedUpdateCollaborator.mockResolvedValue(
        Exit.succeed(buildCollaborator({ roleLabel: "Read-only contact" }))
      );
      mockedDetachCollaborator.mockResolvedValue(
        Exit.succeed(buildCollaborator())
      );

      const user = userEvent.setup();
      renderDetailSheet(buildDetail(), {
        role: "admin",
        userId: "99999999-9999-4999-8999-999999999999" as UserIdType,
      });
      await openJobDetailTab(user, /collaborator/i);

      await screen.findByText("Collaborators");
      await screen.findByText("External Partner");

      expect(mockedRefreshCollaborators).toHaveBeenCalledWith();
      expect(mockedGetExternalMemberOptions).toHaveBeenCalledWith();

      await user.selectOptions(
        screen.getByLabelText("External collaborator"),
        secondExternalUserId
      );
      await user.clear(screen.getByLabelText("Role label"));
      await user.type(screen.getByLabelText("Role label"), "Tenant contact");
      await user.selectOptions(
        screen.getByLabelText("Access level"),
        "comment"
      );
      await user.click(screen.getByRole("button", { name: /grant access/i }));

      expect(mockedAttachCollaborator).toHaveBeenCalledWith({
        accessLevel: "comment",
        roleLabel: "Tenant contact",
        userId: secondExternalUserId,
      });

      await user.clear(
        screen.getByLabelText("Role label for External Partner")
      );
      await user.type(
        screen.getByLabelText("Role label for External Partner"),
        "Read-only contact"
      );
      await user.selectOptions(
        screen.getByLabelText("Access level for External Partner"),
        "read"
      );
      await user.click(
        screen.getByRole("button", {
          name: /save external partner access/i,
        })
      );

      expect(mockedUpdateCollaborator).toHaveBeenCalledWith({
        collaboratorId,
        input: {
          accessLevel: "read",
          roleLabel: "Read-only contact",
        },
      });

      await user.click(
        screen.getByRole("button", {
          name: /remove external partner access/i,
        })
      );

      expect(mockedDetachCollaborator).toHaveBeenCalledWith(collaboratorId);
    }
  );

  it(
    "rejects invalid cost form values before submitting",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderDetailSheet(buildDetail());
      await openJobDetailTab(user, /costs/i);

      await user.type(screen.getByLabelText("Cost description"), "Install kit");
      await user.clear(screen.getByLabelText("Quantity"));
      await user.type(screen.getByLabelText("Quantity"), "1");
      await user.click(screen.getByRole("button", { name: /add cost line/i }));

      expect(screen.getByText("Enter a unit price.")).toBeInTheDocument();
      expect(mockedAddCostLine).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Unit price"), {
        target: { value: "1.234" },
      });
      await user.click(screen.getByRole("button", { name: /add cost line/i }));

      expect(
        screen.getByText("Unit price can use at most 2 decimal places.")
      ).toBeInTheDocument();
      expect(mockedAddCostLine).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Unit price"), {
        target: { value: "21474836.48" },
      });
      await user.click(screen.getByRole("button", { name: /add cost line/i }));

      expect(
        screen.getByText("Unit price must be no more than €21,474,836.47.")
      ).toBeInTheDocument();
      expect(mockedAddCostLine).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Unit price"), {
        target: { value: "1" },
      });
      fireEvent.change(screen.getByLabelText("Quantity"), {
        target: { value: "1.234" },
      });
      await user.click(screen.getByRole("button", { name: /add cost line/i }));

      expect(
        screen.getByText("Quantity can use at most 2 decimal places.")
      ).toBeInTheDocument();
      expect(mockedAddCostLine).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Quantity"), {
        target: { value: "10000000000" },
      });
      await user.click(screen.getByRole("button", { name: /add cost line/i }));

      expect(
        screen.getByText("Quantity must be no more than 9,999,999,999.99.")
      ).toBeInTheDocument();
      expect(mockedAddCostLine).not.toHaveBeenCalled();
    }
  );

  it(
    "submits valid cost form values with exact minor-unit conversion",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddCostLine.mockResolvedValue(
        Exit.succeed({
          authorUserId: actorUserId,
          createdAt: "2026-04-23T12:00:00.000Z",
          description: "Install kit",
          id: "99999999-9999-4999-8999-999999999999",
          lineTotalMinor: 136,
          quantity: 1.7,
          type: "material",
          unitPriceMinor: 80,
          workItemId,
        })
      );

      const user = userEvent.setup();
      renderDetailSheet(buildDetail());
      await openJobDetailTab(user, /costs/i);

      await user.selectOptions(screen.getByLabelText("Cost type"), "material");
      await user.type(screen.getByLabelText("Cost description"), "Install kit");
      await user.clear(screen.getByLabelText("Quantity"));
      await user.type(screen.getByLabelText("Quantity"), "1.70");
      await user.clear(screen.getByLabelText("Unit price"));
      await user.type(screen.getByLabelText("Unit price"), "0.80");
      await user.click(screen.getByRole("button", { name: /add cost line/i }));

      expect(mockedAddCostLine).toHaveBeenCalledWith({
        description: "Install kit",
        quantity: 1.7,
        type: "material",
        unitPriceMinor: 80,
      });
    }
  );

  it(
    "logs a visit and clears the visit form",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddVisit.mockResolvedValue(
        Exit.succeed({
          authorUserId: actorUserId,
          createdAt: "2026-04-23T12:00:00.000Z",
          durationMinutes: 120,
          id: "55555555-5555-4555-8555-555555555555" as VisitIdType,
          note: "Second trip to confirm the repair held.",
          visitDate: "2026-04-24",
          workItemId,
        })
      );

      const user = userEvent.setup();
      renderDetailSheet(buildDetail());
      await openJobDetailTab(user, /visits/i);

      await user.clear(screen.getByLabelText("Visit date"));
      await user.type(screen.getByLabelText("Visit date"), "2026-04-24");
      await user.selectOptions(screen.getByLabelText("Duration"), "120");
      const visitNoteField = screen.getByLabelText("Visit note");
      await user.type(
        visitNoteField,
        "Second trip to confirm the repair held."
      );
      await user.click(screen.getByRole("button", { name: /log visit/i }));

      expect(mockedAddVisit).toHaveBeenCalledWith({
        durationMinutes: 120,
        note: "Second trip to confirm the repair held.",
        visitDate: "2026-04-24",
      });
      expect(visitNoteField).toHaveValue("");
    }
  );

  it(
    "shows the reopen action for completed jobs",
    {
      timeout: 10_000,
    },
    async () => {
      mockedReopenJob.mockResolvedValue(
        Exit.succeed({
          ...buildDetail({ status: "completed" }).job,
          status: "in_progress",
        })
      );

      const user = userEvent.setup();
      renderDetailSheet(buildDetail({ status: "completed" }));
      await openJobDetailTab(user, /status/i);

      await user.click(screen.getByRole("button", { name: /reopen job/i }));

      expect(mockedReopenJob).toHaveBeenCalledWith();
    }
  );

  it("hides transition and visit actions from unassigned members", async () => {
    const user = userEvent.setup();
    renderDetailSheet(buildDetail(), {
      role: "member",
      userId: "99999999-9999-4999-8999-999999999999" as UserIdType,
    });
    await openJobDetailTab(user, /status/i);

    expect(
      screen.queryByRole("button", { name: /apply status change/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /log visit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add label/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /remove urgent callout label/i,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/status changes open once this job is assigned to you/i)
    ).toBeInTheDocument();
    await openJobDetailTab(user, /visits/i);
    expect(
      screen.getByText(/members can only log visits on jobs assigned to them/i)
    ).toBeInTheDocument();
  }, 1000);
});

function buildDetail(overrides?: {
  readonly comments?: JobDetailResponse["comments"];
  readonly contact?: JobDetailResponse["contact"];
  readonly costs?: JobDetailResponse["costs"];
  readonly labels?: ReturnType<typeof buildLabel>[];
  readonly site?: JobDetailResponse["site"];
  readonly siteId?: SiteIdType | undefined;
  readonly status?: "blocked" | "in_progress" | "completed";
  readonly viewerAccess?: JobDetailResponse["viewerAccess"];
}) {
  const status = overrides?.status ?? "in_progress";
  return {
    activity: [
      {
        actorUserId,
        createdAt: "2026-04-23T10:00:00.000Z",
        id: "66666666-6666-4666-8666-666666666666" as ActivityIdType,
        payload: {
          eventType: "job_created" as const,
          kind: "job" as const,
          priority: "medium" as const,
          title: "Inspect boiler",
        },
        workItemId,
      },
    ],
    comments: overrides?.comments ?? [
      {
        authorName: "Taylor Owner",
        authorUserId: actorUserId,
        body: "Checked the burner and reset the controls.",
        createdAt: "2026-04-23T11:00:00.000Z",
        id: "77777777-7777-4777-8777-777777777777" as CommentIdType,
        workItemId,
      },
    ],
    contact:
      overrides && "contact" in overrides
        ? overrides.contact
        : {
            email: "pat@example.com",
            id: contactId,
            name: "Pat Contact",
            notes: "Use email for routine updates.",
            phone: "+353 87 765 4321",
          },
    costs:
      overrides && "costs" in overrides
        ? overrides.costs
        : {
            lines: [],
            summary: {
              subtotalMinor: 0,
            },
          },
    viewerAccess: overrides?.viewerAccess ?? {
      canComment: true,
      visibility: "internal" as const,
    },
    site: overrides?.site,
    job: {
      assigneeId: actorUserId,
      createdAt: "2026-04-23T10:00:00.000Z",
      createdByUserId: actorUserId,
      id: workItemId,
      kind: "job" as const,
      labels: overrides?.labels ?? [
        buildLabel(urgentLabelId, "Urgent callout"),
      ],
      priority: "medium" as const,
      siteId: overrides && "siteId" in overrides ? overrides.siteId : siteId,
      status,
      title: "Inspect boiler",
      updatedAt: "2026-04-23T12:00:00.000Z",
    },
    visits: [
      {
        authorUserId: actorUserId,
        createdAt: "2026-04-23T11:30:00.000Z",
        durationMinutes: 60,
        id: "88888888-8888-4888-8888-888888888888" as VisitIdType,
        note: "Replaced faulty relay and tested startup.",
        visitDate: "2026-04-23",
        workItemId,
      },
    ],
  };
}

function buildSiteOption(): SiteOption {
  return {
    accessNotes: "Use the south gate and ring reception.",
    addressLine1: "1 Custom House Quay",
    addressLine2: "North Dock",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    geocodedAt: "2026-04-23T09:00:00.000Z",
    geocodingProvider: "google",
    id: siteId,
    labels: [],
    latitude: 53.3498,
    longitude: -6.2603,
    name: "Docklands Campus",
    serviceAreaName: "Dublin",
    town: "Dublin",
  };
}

interface TestJobCollaborator {
  readonly accessLevel: "comment" | "read";
  readonly createdAt: string;
  readonly id: JobCollaboratorIdType;
  readonly roleLabel: string;
  readonly subjectType: "user";
  readonly updatedAt: string;
  readonly userId: UserIdType;
  readonly workItemId: WorkItemIdType;
}

function buildCollaborator(
  overrides?: Partial<TestJobCollaborator>
): TestJobCollaborator {
  return {
    accessLevel: "comment" as const,
    createdAt: "2026-04-23T09:00:00.000Z",
    id: collaboratorId,
    roleLabel: "Tenant reviewer",
    subjectType: "user" as const,
    updatedAt: "2026-04-23T09:00:00.000Z",
    userId: externalUserId,
    workItemId,
    ...overrides,
  };
}

function buildLabel(id: LabelIdType, name: string) {
  return {
    createdAt: "2026-04-23T09:00:00.000Z",
    id,
    name,
    updatedAt: "2026-04-23T09:00:00.000Z",
  };
}

function buildIdleMutationResults() {
  const idleResult = {
    error: null,
    waiting: false,
  } satisfies JobsAsyncResult;

  return {
    addComment: idleResult,
    addCostLine: idleResult,
    addVisit: idleResult,
    assignLabel: idleResult,
    attachCollaborator: idleResult,
    createAndAssignLabel: idleResult,
    detachCollaborator: idleResult,
    patch: idleResult,
    refreshCollaborators: idleResult,
    removeLabel: idleResult,
    reopen: idleResult,
    transition: idleResult,
    updateCollaborator: idleResult,
  };
}

function buildJobsDetailState(detail: JobDetailResponse) {
  return {
    addJobComment: mockedAddComment,
    addJobCostLine: mockedAddCostLine,
    addJobVisit: mockedAddVisit,
    assignJobLabel: mockedAssignLabel,
    attachCollaborator: mockedAttachCollaborator,
    collaborators: collaboratorState,
    createAndAssignJobLabel: mockedCreateAndAssignLabel,
    detachCollaborator: mockedDetachCollaborator,
    detail,
    patchJob: mockedPatchJob,
    refreshCollaborators: mockedRefreshCollaborators,
    removeJobLabel: mockedRemoveLabel,
    reopenJob: mockedReopenJob,
    results: buildIdleMutationResults(),
    transitionJob: mockedTransitionJob,
    updateCollaborator: mockedUpdateCollaborator,
  };
}

function renderDetailSheet(
  initialDetail: ReturnType<typeof buildDetail>,
  viewer?: JobsViewer,
  options?: { readonly withCommandBar?: boolean }
) {
  mockedUseJobsDetailState.mockReturnValue(buildJobsDetailState(initialDetail));

  const sheet = (
    <JobsDetailSheet
      initialDetail={initialDetail}
      viewer={
        viewer ?? {
          role: "owner",
          userId: actorUserId,
        }
      }
    />
  );

  return render(
    options?.withCommandBar ? (
      <CommandBarProvider>{sheet}</CommandBarProvider>
    ) : (
      sheet
    )
  );
}

async function openJobDetailTab(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp | string
) {
  const text = String(name).toLowerCase();
  let buttonName = name;

  if (text.includes("comment")) {
    buttonName = /comment/i;
  } else if (text.includes("cost")) {
    buttonName = /cost/i;
  } else if (text.includes("visit")) {
    buttonName = /visit/i;
  } else if (text.includes("site")) {
    buttonName = /^site$/i;
  } else if (text.includes("workflow") || text.includes("status")) {
    buttonName = /status/i;
  } else if (text.includes("collaborator")) {
    buttonName = /collaborator/i;
  }

  await user.click(screen.getByRole("button", { name: buttonName }));
}
