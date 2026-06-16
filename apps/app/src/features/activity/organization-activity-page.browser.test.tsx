import type {
  ActivityEventIdType,
  ProductActivityEvent,
} from "@ceird/activity-core";
import type {
  OrganizationId,
  ProductActor,
  ProductActorId,
} from "@ceird/identity-core";
import type { WorkItemIdType } from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { SiteIdType } from "@ceird/sites-core";
import type { HotkeyCallback, UseHotkeyOptions } from "@tanstack/react-hotkeys";
/* oxlint-disable vitest/prefer-import-in-mock */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { createDataPlaneCollectionHealth } from "#/data-plane/collection-health";
import type { HotkeyId } from "#/hotkeys/hotkey-registry";

import type { ActivitySearch } from "./activity-search";
import type { ActivityCollectionStateLike } from "./organization-activity-page";

const organizationId = "org_123" as OrganizationId;
const taylorActorId = "77777777-7777-4777-8777-777777777777" as ProductActorId;
const jordanActorId = "88888888-8888-4888-8888-888888888888" as ProductActorId;
const mockedNavigate = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<void>>()
);
const mockedUseAppHotkey = vi.hoisted(() =>
  vi.fn<
    (id: HotkeyId, callback: HotkeyCallback, options?: UseHotkeyOptions) => void
  >()
);

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      href,
      onClick,
      to,
      ...props
    }: ComponentProps<"a"> & {
      search?: unknown;
      to?: string;
    }) => (
      <a
        href={href ?? to}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </a>
    )) as typeof actual.Link,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock(import("#/hotkeys/use-app-hotkey"), () => ({
  useAppHotkey: mockedUseAppHotkey,
}));

describe("organization activity page", () => {
  beforeEach(() => {
    mockedNavigate.mockClear();
    mockedNavigate.mockResolvedValue();
    mockedUseAppHotkey.mockClear();
  });

  it(
    "renders joined Electric activity rows, actor display, and target links",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState("activity-events", activityEvents)}
          currentOrganizationRole="member"
          search={{}}
          onSearchChange={vi.fn<(search: ActivitySearch) => void>()}
        />
      );

      const createdRow = await screen.findByText("Boiler inspection created");
      expect(createdRow).toBeVisible();
      expect(screen.getByText("Taylor Owner (Team member)")).toBeVisible();
      expect(screen.getByText("Jordan Admin (Team member)")).toBeVisible();
      expect(screen.getByText("2 events")).toBeVisible();
      expect(screen.getAllByRole("link", { name: /open/i })).toHaveLength(2);
      expect(screen.getByLabelText("Event type")).toBeInTheDocument();
      expect(screen.getByLabelText("Entity type")).toBeInTheDocument();
      expect(screen.getByLabelText("Status")).toBeInTheDocument();
      expect(screen.getByText("Realtime ready")).toBeVisible();
    }
  );

  it(
    "filters synced rows locally by event, entity, and status",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const onSearchChange = vi.fn<(search: ActivitySearch) => void>();
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");
      const { rerender } = render(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState("activity-events", activityEvents)}
          currentOrganizationRole="member"
          search={{}}
          onSearchChange={onSearchChange}
        />
      );

      await user.selectOptions(screen.getByLabelText("Event type"), [
        "site.updated",
      ]);
      expect(onSearchChange).toHaveBeenCalledWith({
        eventType: "site.updated",
      });

      rerender(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState("activity-events", activityEvents)}
          currentOrganizationRole="member"
          search={{ eventType: "site.updated", targetType: "site" }}
          onSearchChange={onSearchChange}
        />
      );

      const updatedSiteRow = await screen.findByText("Gate access changed");
      expect(updatedSiteRow).toBeVisible();
      expect(
        screen.queryByText("Boiler inspection created")
      ).not.toBeInTheDocument();
      expect(screen.getByText("1 of 2 events")).toBeVisible();
      expect(screen.getByText("Event: Site updated")).toBeVisible();
      expect(screen.getByText("Entity: Site")).toBeVisible();

      rerender(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState("activity-events", activityEvents)}
          currentOrganizationRole="member"
          search={{ status: "failed" }}
          onSearchChange={onSearchChange}
        />
      );

      const noMatchesMessage = await screen.findByText("No matching activity");
      expect(noMatchesMessage).toBeVisible();
      expect(screen.getByText("Status: Failed")).toBeVisible();
    }
  );

  it(
    "handles connecting, empty, unavailable, stale, degraded, and permission-aware states",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");
      const renderPage = (
        eventsState: ActivityCollectionStateLike<ProductActivityEvent>,
        state?: ComponentProps<typeof OrganizationActivityPage>["state"]
      ) =>
        render(
          <OrganizationActivityPage
            actorsState={makeCollectionState("product-activity-actors", actors)}
            eventsState={eventsState}
            currentOrganizationRole="member"
            search={{}}
            state={state}
            onSearchChange={vi.fn<(search: ActivitySearch) => void>()}
          />
        );

      const connecting = renderPage(
        makeCollectionState("activity-events", [], "connecting")
      );
      const connectingMessage = await screen.findByText(
        "Connecting to realtime activity"
      );
      expect(connectingMessage).toBeVisible();
      connecting.unmount();

      const empty = renderPage(makeCollectionState("activity-events", []));
      const emptyMessage = await screen.findByText("No activity recorded yet");
      expect(emptyMessage).toBeVisible();
      empty.unmount();

      const unavailable = renderPage(
        makeCollectionState("activity-events", [], "unavailable")
      );
      const unavailableMessages = await screen.findAllByText(
        "Realtime activity unavailable"
      );
      expect(unavailableMessages[0]).toBeVisible();
      unavailable.unmount();

      const stale = renderPage(
        makeCollectionState("activity-events", activityEvents, "unavailable")
      );
      const staleMessage = await screen.findByText(
        "Showing last synced activity"
      );
      expect(staleMessage).toBeVisible();
      expect(screen.getByText("Boiler inspection created")).toBeVisible();
      stale.unmount();

      const degraded = renderPage(
        makeCollectionState("activity-events", activityEvents, "degraded")
      );
      const degradedMessage = await screen.findByText("Realtime recovered");
      expect(degradedMessage).toBeVisible();
      degraded.unmount();

      renderPage(
        makeCollectionState("activity-events", []),
        "permission-aware"
      );
      const internalActivityMessage =
        await screen.findByText("Internal activity");
      expect(internalActivityMessage).toBeVisible();
    }
  );

  it(
    "registers Activity hotkeys for focus, filter clearing, row selection, and opening",
    {
      timeout: 10_000,
    },
    async () => {
      const onSearchChange = vi.fn<(search: ActivitySearch) => void>();
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState("activity-events", activityEvents)}
          currentOrganizationRole="member"
          search={{ eventType: "job.created" }}
          onSearchChange={onSearchChange}
        />
      );

      await screen.findByText("Boiler inspection created");

      act(() => getLatestHotkeyCallback("activitySearch")());
      expect(screen.getByLabelText("Event type")).toHaveFocus();

      act(() => getLatestHotkeyCallback("activityClearFilters")());
      expect(onSearchChange).toHaveBeenCalledWith({});

      act(() => getLatestHotkeyCallback("activityNextRow")());
      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: "Open Boiler inspection created" })
        ).toHaveFocus()
      );
      act(() => getLatestHotkeyCallback("activityOpenSelectedRow")());
      expect(mockedNavigate).toHaveBeenCalledWith({
        search: {
          sheets: [
            {
              jobId: "44444444-4444-4444-8444-444444444444",
              kind: "job.detail",
            },
          ],
        },
        to: "/jobs",
      });
    }
  );

  it(
    "opens site rows to the site detail workspace sheet",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState("activity-events", activityEvents)}
          currentOrganizationRole="member"
          search={{ eventType: "site.updated" }}
          onSearchChange={vi.fn<(search: ActivitySearch) => void>()}
        />
      );

      const updatedSiteRow = await screen.findByText("Gate access changed");
      expect(updatedSiteRow).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Open Gate access changed" })
      ).toHaveAttribute("href", "/sites");

      act(() => getLatestHotkeyCallback("activityOpenSelectedRow")());
      expect(mockedNavigate).toHaveBeenCalledWith({
        search: {
          sheets: [
            {
              kind: "site.detail",
              siteId: "55555555-5555-4555-8555-555555555555",
            },
          ],
        },
        to: "/sites",
      });
    }
  );

  it(
    "does not expose admin-only label navigation to ordinary members",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState(
            "activity-events",
            labelActivityEvents
          )}
          currentOrganizationRole="member"
          search={{}}
          onSearchChange={vi.fn<(search: ActivitySearch) => void>()}
        />
      );

      const memberLabelRow = await screen.findByText("Safety label changed");
      expect(memberLabelRow).toBeVisible();
      expect(
        screen.queryByRole("link", { name: "Open Safety label changed" })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "No supported destination for Safety label changed",
        })
      ).toBeDisabled();

      act(() => getLatestHotkeyCallback("activityOpenSelectedRow")());
      expect(mockedNavigate).not.toHaveBeenCalled();
    }
  );

  it(
    "allows label rows to open label settings for administrators",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationActivityPage } =
        await import("./organization-activity-page");

      render(
        <OrganizationActivityPage
          actorsState={makeCollectionState("product-activity-actors", actors)}
          eventsState={makeCollectionState(
            "activity-events",
            labelActivityEvents
          )}
          currentOrganizationRole="admin"
          search={{}}
          onSearchChange={vi.fn<(search: ActivitySearch) => void>()}
        />
      );

      const adminLabelRow = await screen.findByText("Safety label changed");
      expect(adminLabelRow).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Open Safety label changed" })
      ).toHaveAttribute("href", "/organization/settings/labels");

      act(() => getLatestHotkeyCallback("activityOpenSelectedRow")());
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/organization/settings/labels",
      });
    }
  );
});

const actors = [
  {
    displayDetail: "Team member",
    displayName: "Taylor Owner",
    id: taylorActorId,
    kind: "member",
  },
  {
    displayDetail: "Team member",
    displayName: "Jordan Admin",
    id: jordanActorId,
    kind: "member",
  },
] satisfies readonly ProductActor[];

const activityEvents = [
  {
    actorId: taylorActorId,
    createdAt: "2026-04-28T10:15:00.000Z",
    display: {
      detail: "Inspect boiler was added to the active job list.",
      summary: "Boiler inspection created",
    },
    eventType: "job.created",
    id: "11111111-1111-4111-8111-111111111111" as ActivityEventIdType,
    organizationId,
    retainedUntil: "2026-05-28T10:15:00.000Z",
    sourceId: "11111111-1111-4111-8111-111111111111",
    sourceType: "job_activity",
    status: "synced",
    targetId: "44444444-4444-4444-8444-444444444444" as WorkItemIdType,
    targetType: "job",
  },
  {
    actorId: jordanActorId,
    createdAt: "2026-04-29T09:30:00.000Z",
    display: {
      detail: "Main gate access notes were updated.",
      summary: "Gate access changed",
    },
    eventType: "site.updated",
    id: "22222222-2222-4222-8222-222222222222" as ActivityEventIdType,
    organizationId,
    retainedUntil: "2026-05-29T09:30:00.000Z",
    sourceId: "55555555-5555-4555-8555-555555555555",
    sourceType: "site",
    status: "pending",
    targetId: "55555555-5555-4555-8555-555555555555" as SiteIdType,
    targetType: "site",
  },
] satisfies readonly ProductActivityEvent[];

const labelActivityEvents = [
  {
    actorId: jordanActorId,
    createdAt: "2026-04-30T11:30:00.000Z",
    display: {
      detail: "Safety label color and description were updated.",
      summary: "Safety label changed",
    },
    eventType: "label.updated",
    id: "33333333-3333-4333-8333-333333333333" as ActivityEventIdType,
    organizationId,
    retainedUntil: "2026-05-30T11:30:00.000Z",
    sourceId: "66666666-6666-4666-8666-666666666666",
    sourceType: "label",
    status: "synced",
    targetId: "66666666-6666-4666-8666-666666666666" as LabelIdType,
    targetType: "label",
  },
] satisfies readonly ProductActivityEvent[];

function getLatestHotkeyCallback(id: HotkeyId) {
  const call = mockedUseAppHotkey.mock.calls
    .toReversed()
    .find(([hotkeyId]) => hotkeyId === id);

  expect(call).toBeDefined();

  return call?.[1] as () => void;
}

function makeCollectionState<Item extends object>(
  collection: "activity-events" | "product-activity-actors",
  items: readonly Item[],
  status: "connecting" | "degraded" | "ready" | "unavailable" = "ready"
): ActivityCollectionStateLike<Item> {
  const health = createDataPlaneCollectionHealth({
    collection,
    collectionId: `test:${collection}`,
    source: "electric",
    status: status === "ready" || status === "degraded" ? "connecting" : status,
    subscriptionName: collection,
  });

  if (status === "ready") {
    health.markReady();
  }

  if (status === "degraded") {
    health.markUnavailable({
      kind: "network",
      message: "Temporary sync interruption",
      retryable: true,
    });
    health.markReady();
  }

  return {
    collection: makeCollection(items),
    health,
  };
}

function makeCollection<Item extends object>(items: readonly Item[]) {
  const entries = new Map<string, Item>(
    items.map((item, index) => [String(index), item])
  );

  return {
    entries: () => entries.entries(),
    status: "ready",
    subscribeChanges: (_callback: () => void) => ({
      requestSnapshot: () => {},
      unsubscribe: () => {},
    }),
  };
}
