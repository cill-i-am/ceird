import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WorkspaceSheetNavigationProvider,
  useWorkspaceSheetNavigation,
} from "./workspace-sheet-navigation";

const { mockedNavigate, mockedUseNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
  mockedUseNavigate: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: ((...args: unknown[]) => {
      mockedUseNavigate(...args);

      return mockedNavigate;
    }) as typeof actual.useNavigate,
    useRouterState: (({ select }: { select: (state: unknown) => unknown }) =>
      select({
        location: { pathname: "/sites" },
      })) as typeof actual.useRouterState,
  };
});

describe("workspace sheet navigation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pushes a sheet while preserving existing search state", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceSheetNavigationProvider
        stack={[
          {
            kind: "site.detail",
            siteId: "019e6b6f-03d3-73e3-9dc6-d303722eef9a" as never,
          },
        ]}
      >
        <PushSiteCreateButton />
      </WorkspaceSheetNavigationProvider>
    );

    await user.click(screen.getByRole("button", { name: "Push sheet" }));

    expect(mockedUseNavigate).toHaveBeenCalledWith({ from: "/" });
    expect(mockedNavigate).toHaveBeenCalledOnce();
    const navigation = mockedNavigate.mock.calls[0]?.[0] as {
      readonly search: (current: unknown) => unknown;
    };

    expect(
      navigation.search({
        sheets: [
          {
            kind: "site.detail",
            siteId: "019e6b6f-03d3-73e3-9dc6-d303722eef9a",
          },
        ],
        view: "map",
      })
    ).toStrictEqual({
      sheets: [
        {
          kind: "site.detail",
          siteId: "019e6b6f-03d3-73e3-9dc6-d303722eef9a",
        },
        { kind: "site.create" },
      ],
      view: "map",
    });
  });

  it("derives push updates from the latest router search stack", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceSheetNavigationProvider stack={[]}>
        <PushSiteCreateButton />
      </WorkspaceSheetNavigationProvider>
    );

    await user.click(screen.getByRole("button", { name: "Push sheet" }));
    await user.click(screen.getByRole("button", { name: "Push sheet" }));

    const firstNavigation = mockedNavigate.mock.calls[0]?.[0] as {
      readonly search: (current: unknown) => unknown;
    };
    const secondNavigation = mockedNavigate.mock.calls[1]?.[0] as {
      readonly search: (current: unknown) => unknown;
    };
    const currentAfterFirstPush = firstNavigation.search({});

    expect(secondNavigation.search(currentAfterFirstPush)).toStrictEqual({
      sheets: [{ kind: "site.create" }, { kind: "site.create" }],
    });
  });
});

function PushSiteCreateButton() {
  const { push } = useWorkspaceSheetNavigation();

  return (
    <button type="button" onClick={() => push({ kind: "site.create" })}>
      Push sheet
    </button>
  );
}
