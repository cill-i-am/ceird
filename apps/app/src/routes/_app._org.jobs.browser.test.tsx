import type * as ReactRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ComponentType } from "react";

import type { LocalConvenienceCollection } from "#/data-plane/local-convenience-collections";
import type { JobsWorkspaceRouteShell } from "#/features/jobs-workspace/jobs-workspace-route-shell";

type RouteSearchUpdate = Record<string, unknown>;
interface NavigateOptions {
  readonly replace?: boolean | undefined;
  readonly search: (current: RouteSearchUpdate) => unknown;
}

const routeMock = vi.hoisted(() => ({
  navigate: vi.fn<(options: NavigateOptions) => Promise<void>>(() =>
    Promise.resolve()
  ),
  search: {} as RouteSearchUpdate,
}));

const throwingLocalCollection = vi.hoisted(() => ({
  delete: vi.fn<(id: string) => void>(() => {
    throw new Error("local delete failed");
  }),
  insert: vi.fn<(record: unknown) => void>(() => {
    throw new Error("local insert failed");
  }),
  state: {
    has: vi.fn<(id: string) => boolean>(() => false),
  },
  toArray: [],
  update: vi.fn<(id: string, updater: (draft: unknown) => void) => void>(() => {
    throw new Error("local update failed");
  }),
}));

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    createFileRoute: (() =>
      (options: { readonly component: ComponentType }) => ({
        ...options,
        useRouteContext: () => ({ currentOrganizationRole: "owner" }),
        useSearch: () => routeMock.search,
      })) as unknown as typeof ReactRouter.createFileRoute,
    useNavigate: (() =>
      routeMock.navigate) as unknown as typeof ReactRouter.useNavigate,
    useRouterState: ((options: unknown) => {
      const typedOptions = options as {
        readonly select: (state: {
          readonly location: { readonly pathname: string };
        }) => unknown;
      };

      return typedOptions.select({ location: { pathname: "/jobs" } });
    }) as unknown as typeof ReactRouter.useRouterState,
  };
});

vi.mock(
  import("#/data-plane/local-convenience-collections"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      useLocalConvenienceRecords: () => ({
        collection:
          throwingLocalCollection as unknown as LocalConvenienceCollection,
        records: [],
        status: "disabled",
      }),
    };
  }
);

vi.mock(import("#/features/jobs-workspace/jobs-workspace-route-shell"), () => ({
  JobsWorkspaceRouteShell: (
    props: ComponentProps<typeof JobsWorkspaceRouteShell>
  ) => (
    <div>
      <button
        type="button"
        onClick={() => props.onRecentSearchCommit("  pump  ")}
      >
        Commit recent search
      </button>
      <button type="button" onClick={() => props.onViewChange("board")}>
        Switch to board
      </button>
    </div>
  ),
}));

describe("Jobs route local convenience persistence", () => {
  beforeEach(() => {
    routeMock.navigate.mockClear();
    routeMock.search = {};
    throwingLocalCollection.delete.mockClear();
    throwingLocalCollection.insert.mockClear();
    throwingLocalCollection.state.has.mockClear();
    throwingLocalCollection.update.mockClear();
  });

  it("keeps route navigation usable when local convenience writes fail", async () => {
    const user = userEvent.setup();
    const { Route } = await import("./_app._org.jobs");
    const JobsRouteComponent = (
      Route as unknown as { component: ComponentType }
    ).component;

    render(<JobsRouteComponent />);

    await user.click(screen.getByRole("button", { name: /commit recent/i }));

    expect(routeMock.navigate).toHaveBeenCalledWith({
      replace: true,
      search: expect.any(Function),
    });
    expect(routeMock.navigate.mock.calls[0]?.[0].search({})).toStrictEqual({
      recentSearch: "pump",
    });
    expect(throwingLocalCollection.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "recent-search",
        query: "pump",
        surface: "jobs",
      })
    );

    routeMock.navigate.mockClear();

    await user.click(screen.getByRole("button", { name: /switch to board/i }));

    expect(routeMock.navigate).toHaveBeenCalledWith({
      search: expect.any(Function),
    });
    expect(routeMock.navigate.mock.calls[0]?.[0].search({})).toStrictEqual({
      view: "board",
    });
  });
});
