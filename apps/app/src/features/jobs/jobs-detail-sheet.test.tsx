/* oxlint-disable vitest/prefer-import-in-mock */
import type {
  SiteIdType,
  UserIdType,
  WorkItemIdType,
  CommentIdType,
  ActivityIdType,
  VisitIdType,
} from "@task-tracker/jobs-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exit } from "effect";
import type { ComponentProps, ReactNode } from "react";

import { JobsDetailSheet } from "./jobs-detail-sheet";
import type { JobsViewer } from "./jobs-viewer";

type AsyncMutationMock = (...args: unknown[]) => Promise<unknown>;
type AtomSetterMock = (atom: unknown) => unknown;
type AtomValueMock = (atom: unknown) => unknown;
type InitialValuesMock = (values: (readonly [unknown, unknown])[]) => void;
type NavigateMock = (...args: unknown[]) => unknown;

const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const actorUserId = "22222222-2222-4222-8222-222222222222" as UserIdType;

const {
  mockedNavigate,
  mockedUseAtomInitialValues,
  mockedUseAtomSet,
  mockedUseAtomValue,
} = vi.hoisted(() => ({
  mockedNavigate: vi.fn<NavigateMock>(),
  mockedUseAtomInitialValues: vi.fn<InitialValuesMock>(),
  mockedUseAtomSet: vi.fn<AtomSetterMock>(),
  mockedUseAtomValue: vi.fn<AtomValueMock>(),
}));

const { jobsLookupAtomToken } = vi.hoisted(() => ({
  jobsLookupAtomToken: "jobsLookupAtom",
}));

const mockedTransitionJob = vi.fn<AsyncMutationMock>();
const mockedReopenJob = vi.fn<AsyncMutationMock>();
const mockedAddComment = vi.fn<AsyncMutationMock>();
const mockedAddVisit = vi.fn<AsyncMutationMock>();

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
    useAtomInitialValues: mockedUseAtomInitialValues as never,
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
    className: _className,
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

vi.mock("#/components/ui/sheet", () => ({
  Sheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  SheetDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  SheetFooter: ({ children }: { children?: ReactNode }) => (
    <footer>{children}</footer>
  ),
  SheetHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("#/components/ui/textarea", () => ({
  Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

vi.mock("./jobs-detail-state", () => ({
  addJobCommentMutationAtomFamily: (id: string) => `comment:${id}`,
  addJobVisitMutationAtomFamily: (id: string) => `visit:${id}`,
  jobDetailStateAtomFamily: (id: string) => `detail:${id}`,
  reopenJobMutationAtomFamily: (id: string) => `reopen:${id}`,
  transitionJobMutationAtomFamily: (id: string) => `transition:${id}`,
}));

vi.mock("./jobs-state", () => ({
  jobsLookupAtom: jobsLookupAtomToken,
}));

vi.mock("./jobs-detail-location-map-preview-canvas", () => ({
  JobsDetailLocationMapPreviewCanvas: () => (
    <div data-testid="location-map-preview" />
  ),
}));

describe("jobs detail sheet", () => {
  beforeEach(() => {
    mockedNavigate.mockReset();
    mockedUseAtomInitialValues.mockReset();
    mockedTransitionJob.mockReset();
    mockedReopenJob.mockReset();
    mockedAddComment.mockReset();
    mockedAddVisit.mockReset();

    mockedUseAtomValue.mockImplementation((atom: unknown) => {
      if (atom === `detail:${workItemId}`) {
        return null;
      }

      if (atom === `transition:${workItemId}`) {
        return { waiting: false };
      }

      if (atom === `reopen:${workItemId}`) {
        return { waiting: false };
      }

      if (atom === `comment:${workItemId}`) {
        return { waiting: false };
      }

      if (atom === `visit:${workItemId}`) {
        return { waiting: false };
      }

      if (atom === jobsLookupAtomToken) {
        return {
          contactById: new Map(),
          memberById: new Map([[actorUserId, { name: "Taylor Owner" }]]),
          regionById: new Map(),
          siteById: new Map([
            [
              siteId,
              {
                accessNotes: "Use the south gate and ring reception.",
                addressLine1: "1 Custom House Quay",
                addressLine2: "North Dock",
                county: "Dublin",
                eircode: "D01 X2X2",
                latitude: 53.3498,
                longitude: -6.2603,
                name: "Docklands Campus",
                regionName: "Dublin",
                town: "Dublin",
              },
            ],
          ]),
        };
      }

      return null;
    });

    mockedUseAtomSet.mockImplementation((atom: unknown) => {
      if (atom === `transition:${workItemId}`) {
        return mockedTransitionJob;
      }

      if (atom === `reopen:${workItemId}`) {
        return mockedReopenJob;
      }

      if (atom === `comment:${workItemId}`) {
        return mockedAddComment;
      }

      if (atom === `visit:${workItemId}`) {
        return mockedAddVisit;
      }

      return vi.fn<NavigateMock>();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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
        screen.getByText("Replaced faulty relay and tested startup.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Taylor Owner created the job.")
      ).toBeInTheDocument();
      expect(screen.getAllByText("Docklands Campus").length).toBeGreaterThan(0);
      expect(
        screen.getByText("1 Custom House Quay, North Dock")
      ).toBeInTheDocument();
      expect(screen.getByText("Dublin, Dublin, D01 X2X2")).toBeInTheDocument();
      expect(
        screen.getByText("Use the south gate and ring reception.")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /open in google maps/i })
      ).toHaveAttribute(
        "href",
        "https://www.google.com/maps/search/?api=1&query=53.3498%2C-6.2603"
      );
      expect(mockedUseAtomInitialValues).toHaveBeenCalledWith([
        [`detail:${workItemId}`, buildDetail()],
      ]);
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

  it("renders an explicit empty location state when the job has no site yet", () => {
    renderDetailSheet(buildDetail({ siteId: undefined }));

    expect(screen.getByText("No site attached yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/it will not show up on the map until a site is added/i)
    ).toBeInTheDocument();
  }, 1000);

  it(
    "requires a blocked reason before moving an in-progress job to blocked",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderDetailSheet(buildDetail());

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
    () => {
      renderDetailSheet(buildDetail({ status: "blocked" }));

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

      await user.click(screen.getByRole("button", { name: /reopen job/i }));

      expect(mockedReopenJob).toHaveBeenCalledWith();
    }
  );

  it("hides transition and visit actions from unassigned members", () => {
    renderDetailSheet(buildDetail(), {
      role: "member",
      userId: "99999999-9999-4999-8999-999999999999",
    });

    expect(
      screen.queryByRole("button", { name: /apply status change/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /log visit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/status changes open once this job is assigned to you/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/members can only log visits on jobs assigned to them/i)
    ).toBeInTheDocument();
  }, 1000);
});

function buildDetail(overrides?: {
  readonly siteId?: SiteIdType | undefined;
  readonly status?: "blocked" | "in_progress" | "completed";
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
    comments: [
      {
        authorUserId: actorUserId,
        body: "Checked the burner and reset the controls.",
        createdAt: "2026-04-23T11:00:00.000Z",
        id: "77777777-7777-4777-8777-777777777777" as CommentIdType,
        workItemId,
      },
    ],
    job: {
      assigneeId: actorUserId,
      createdAt: "2026-04-23T10:00:00.000Z",
      createdByUserId: actorUserId,
      id: workItemId,
      kind: "job" as const,
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

function renderDetailSheet(
  initialDetail: ReturnType<typeof buildDetail>,
  viewer?: JobsViewer
) {
  return render(
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
}
