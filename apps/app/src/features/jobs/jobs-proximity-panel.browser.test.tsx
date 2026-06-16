import type {
  JobListItem,
  JobProximityInput,
  JobProximityResponse,
  UserIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type {
  CurrentLocationOrigin,
  GooglePlaceIdType,
  ProximityOriginAutocompleteInput,
  ProximityOriginAutocompleteResponse,
  ProximityOriginInput,
  ProximityOriginPlaceDetailsInput,
  ProximityOriginPlaceDetailsResponse,
  TypedOrigin,
} from "@ceird/proximity-core";
import type { SiteIdType } from "@ceird/sites-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Duration, Effect } from "effect";
import * as React from "react";
import type { ComponentProps } from "react";

import { AppApiRequestError } from "#/features/api/app-api-errors";
import type { AppApiError } from "#/features/api/app-api-errors";
import { BrowserGeolocationPermissionDeniedError } from "#/lib/browser-geolocation";
import type { BrowserGeolocationError } from "#/lib/browser-geolocation";

import type { JobsProximityPanelProps } from "./jobs-proximity-panel";
import type { JobsListFilters } from "./jobs-state";

const {
  mockedAutocompleteProximityOrigin,
  mockedRankNearbyJobs,
  mockedRequestCurrentLocationOrigin,
  mockedResolveProximityOriginPlace,
} = vi.hoisted(() => ({
  mockedAutocompleteProximityOrigin:
    vi.fn<
      (
        input: ProximityOriginAutocompleteInput
      ) => Effect.Effect<ProximityOriginAutocompleteResponse, AppApiError>
    >(),
  mockedRankNearbyJobs:
    vi.fn<
      (
        input: JobProximityInput
      ) => Effect.Effect<JobProximityResponse, AppApiError>
    >(),
  mockedRequestCurrentLocationOrigin:
    vi.fn<
      () => Effect.Effect<CurrentLocationOrigin, BrowserGeolocationError>
    >(),
  mockedResolveProximityOriginPlace:
    vi.fn<
      (
        input: ProximityOriginPlaceDetailsInput
      ) => Effect.Effect<ProximityOriginPlaceDetailsResponse, AppApiError>
    >(),
}));

function delay(ms: number) {
  return Effect.runPromise(Effect.sleep(Duration.millis(ms)));
}

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      search: _search,
      to,
      ...props
    }: ComponentProps<"a"> & { search?: unknown; to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
  };
});

vi.mock(import("#/features/proximity/proximity-api"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    autocompleteProximityOrigin: mockedAutocompleteProximityOrigin,
    rankNearbyJobs: mockedRankNearbyJobs,
    resolveProximityOriginPlace: mockedResolveProximityOriginPlace,
  };
});

vi.mock(import("#/features/proximity/proximity-location-access"), () => ({
  requestCurrentLocationOrigin: mockedRequestCurrentLocationOrigin,
}));

vi.mock(import("./jobs-proximity-map"), () => ({
  JobsProximityMap: () => <div data-testid="jobs-proximity-map" />,
}));

describe("jobs proximity panel", () => {
  beforeEach(() => {
    mockedAutocompleteProximityOrigin.mockReturnValue(
      Effect.succeed({
        suggestions: [
          {
            displayText: "Dublin Port",
            placeId: dublinPortPlaceId,
            secondaryText: "Dublin, Ireland",
          },
        ],
      })
    );
    mockedRankNearbyJobs.mockReturnValue(Effect.succeed(buildResponse()));
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      Effect.succeed(currentLocationOrigin)
    );
    mockedResolveProximityOriginPlace.mockReturnValue(
      Effect.succeed({
        origin: {
          coordinates: { latitude: 53.35, longitude: -6.27 },
          displayText: "Dublin",
          mode: "typed_origin",
          originToken: typedOriginToken,
          placeId: dublinPortPlaceId,
        },
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not request location or route ranking while inactive", async () => {
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");
    const onActiveChange = vi.fn<(active: boolean) => void>();
    const onClearFilters = vi.fn<() => void>();
    const onLimitChange = vi.fn<(limit: 10 | 15 | 20 | 25) => void>();

    render(
      <JobsProximityPanel
        active={false}
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled
        viewMode="list"
        onActiveChange={onActiveChange}
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    expect(mockedRequestCurrentLocationOrigin).not.toHaveBeenCalled();
    expect(mockedRankNearbyJobs).not.toHaveBeenCalled();
  });

  it("can keep the inactive route-aware controls out of the page body when the toolbar owns them", async () => {
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <JobsProximityPanel
        active={false}
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled
        showToolbar={false}
        viewMode="map"
        onActiveChange={vi.fn<(active: boolean) => void>()}
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      >
        <div>Regular jobs content</div>
      </JobsProximityPanel>
    );

    expect(
      screen.queryByLabelText("Route-aware job proximity")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /near me/i })).toBeNull();
    expect(screen.getByText("Regular jobs content")).toBeVisible();
  });

  it("does not request current location from URL-activated Near me until the user confirms", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <JobsProximityPanel
        active
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled
        viewMode="list"
        onActiveChange={vi.fn<(active: boolean) => void>()}
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    expect(mockedRequestCurrentLocationOrigin).not.toHaveBeenCalled();
    expect(mockedRankNearbyJobs).not.toHaveBeenCalled();
    expect(screen.getByText("Choose where routes start")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Use current location" })
    );

    await waitFor(() => {
      expect(mockedRankNearbyJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: currentLocationOrigin,
        })
      );
    });
  });

  it("requests current location and ranks filtered jobs when Near me is selected", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={{
          ...defaultFilters,
          assigneeId: { kind: "user", userId },
          labelId,
          priority: "urgent",
          query: "boiler",
          siteId,
        }}
        limit={10}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(mockedRankNearbyJobs).toHaveBeenCalledWith({
        filters: {
          assigneeId: { kind: "user", userId },
          labelId,
          priority: "urgent",
          query: "boiler",
          siteId,
          status: "active",
        },
        includeRouteLines: false,
        limit: 10,
        origin: currentLocationOrigin,
      });
    });
    await expect(
      screen.findByText("Replace boiler pump")
    ).resolves.toBeVisible();
    expect(screen.getByText("14 min")).toBeVisible();
  });

  it("keeps completed status selected when ranking nearby jobs", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={{
          ...defaultFilters,
          priority: "high",
          status: "completed",
        }}
        limit={15}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(mockedRankNearbyJobs).toHaveBeenCalledWith({
        filters: {
          priority: "high",
          status: "completed",
        },
        includeRouteLines: false,
        limit: 15,
        origin: currentLocationOrigin,
      });
    });
  });

  it("uses typed-origin fallback without geolocation when location preference is disabled", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled={false}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await expect(
      screen.findByText("Current location access is off")
    ).resolves.toBeVisible();
    await expect(
      screen.findByRole("heading", { name: "Choose route origin" })
    ).resolves.toBeVisible();
    expect(mockedRequestCurrentLocationOrigin).not.toHaveBeenCalled();
    expect(mockedRankNearbyJobs).not.toHaveBeenCalled();
  });

  it("clears current-location results when location preference is disabled while active", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");
    const { rerender } = render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByText("Replace boiler pump");

    rerender(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled={false}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await expect(
      screen.findByText("Current location access is off")
    ).resolves.toBeVisible();
    expect(screen.queryByText("Replace boiler pump")).not.toBeInTheDocument();
  });

  it("requests route lines when the Jobs page is in map mode", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={25}
        viewMode="map"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(mockedRankNearbyJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          includeRouteLines: true,
          limit: 25,
        })
      );
    });
  });

  it("reuses map route results when switching back to list mode", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");
    const onClearFilters = vi.fn<() => void>();
    const onLimitChange = vi.fn<(limit: 10 | 15 | 20 | 25) => void>();
    const { rerender } = render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="map"
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(mockedRankNearbyJobs).toHaveBeenCalledOnce();
    });
    expect(mockedRankNearbyJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeRouteLines: true })
    );

    rerender(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    await delay(450);

    expect(mockedRankNearbyJobs).toHaveBeenCalledOnce();
    expect(screen.getByText("Replace boiler pump")).toBeVisible();
  });

  it("fetches route line enrichment when switching from list results to map mode", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");
    const onClearFilters = vi.fn<() => void>();
    const onLimitChange = vi.fn<(limit: 10 | 15 | 20 | 25) => void>();
    const { rerender } = render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(mockedRankNearbyJobs).toHaveBeenCalledOnce();
    });
    expect(mockedRankNearbyJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeRouteLines: false })
    );

    rerender(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="map"
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    await waitFor(() => {
      expect(mockedRankNearbyJobs).toHaveBeenCalledTimes(2);
    });
    expect(mockedRankNearbyJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeRouteLines: true })
    );
  });

  it("hides stale route-ranked rows immediately when active filters change", async () => {
    const user = userEvent.setup();
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");
    const onClearFilters = vi.fn<() => void>();
    const onLimitChange = vi.fn<(limit: 10 | 15 | 20 | 25) => void>();
    const { rerender } = render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await expect(
      screen.findByText("Replace boiler pump")
    ).resolves.toBeVisible();

    rerender(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={{ ...defaultFilters, query: "sink" }}
        limit={10}
        viewMode="list"
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    expect(screen.queryByText("Replace boiler pump")).not.toBeInTheDocument();
    expect(screen.getByText("Ranking nearby jobs")).toBeInTheDocument();
  });

  it("shows safe copy instead of raw transport failures", async () => {
    const user = userEvent.setup();
    mockedRankNearbyJobs.mockReturnValue(
      Effect.fail(
        new AppApiRequestError({
          message: "https://internal.example.test/google/routes failed",
        })
      )
    );
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await expect(
      screen.findByText("Nearby jobs could not be ranked")
    ).resolves.toBeVisible();
    expect(
      screen.getByText(
        "The route provider could not calculate traffic-aware driving times. Ordinary jobs are still available."
      )
    ).toBeVisible();
    expect(screen.queryByText(/internal\.example/i)).not.toBeInTheDocument();
  });

  it("shows typed-origin fallback when current location is denied", async () => {
    const user = userEvent.setup();
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      Effect.fail(
        new BrowserGeolocationPermissionDeniedError({
          message: "Location permission was denied.",
        })
      )
    );
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await expect(
      screen.findByText("Current location unavailable")
    ).resolves.toBeVisible();
    expect(
      screen.getByText(/Ceird could not get your current location/i)
    ).toBeVisible();
    expect(mockedRankNearbyJobs).not.toHaveBeenCalled();
  });

  it("ignores stale current-location results after Near me is disabled", async () => {
    const user = userEvent.setup();
    const firstOriginRequest = makeCurrentLocationRequest();
    mockedRequestCurrentLocationOrigin
      .mockReturnValueOnce(firstOriginRequest.effect)
      .mockReturnValue(Effect.succeed(currentLocationOrigin));
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await user.click(screen.getByRole("button", { name: /near me/i }));
    firstOriginRequest.resolve(currentLocationOrigin);

    await waitFor(() => {
      expect(mockedRankNearbyJobs).not.toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(mockedRequestCurrentLocationOrigin).toHaveBeenCalledTimes(2);
    });
  });

  it("shows typed-origin resolution failures in the origin dialog", async () => {
    const user = userEvent.setup();
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      Effect.fail(
        new BrowserGeolocationPermissionDeniedError({
          message: "Location permission was denied.",
        })
      )
    );
    mockedResolveProximityOriginPlace.mockReturnValue(
      Effect.fail(
        new AppApiRequestError({
          message: "Place details failed.",
        })
      )
    );
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByText("Current location unavailable");
    await user.click(
      within(getProximityStatusPanel()).getByRole("button", {
        name: "Change origin",
      })
    );
    await user.type(
      screen.getByLabelText("Search address, Eircode or place"),
      "Dublin"
    );
    await user.click(
      await screen.findByRole("button", { name: /Dublin Port/ })
    );
    await user.click(
      screen.getByRole("button", { name: "Use selected origin" })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "Ceird could not use that origin"
    );
  });

  it("ignores stale typed-origin details after Near me is disabled", async () => {
    const user = userEvent.setup();
    const placeDetailsRequest = makePlaceDetailsRequest();
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      Effect.fail(
        new BrowserGeolocationPermissionDeniedError({
          message: "Location permission was denied.",
        })
      )
    );
    mockedResolveProximityOriginPlace.mockReturnValue(
      placeDetailsRequest.effect
    );
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");
    const onActiveChange = vi.fn<(active: boolean) => void>();
    const onClearFilters = vi.fn<() => void>();
    const onLimitChange = vi.fn<(limit: 10 | 15 | 20 | 25) => void>();
    const { rerender } = render(
      <JobsProximityPanel
        active
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled
        viewMode="list"
        onActiveChange={onActiveChange}
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Use current location" })
    );
    await screen.findByText("Current location unavailable");
    await user.click(
      within(getProximityStatusPanel()).getByRole("button", {
        name: "Change origin",
      })
    );
    await user.type(
      screen.getByLabelText("Search address, Eircode or place"),
      "Dublin"
    );
    await user.click(
      await screen.findByRole("button", { name: /Dublin Port/ })
    );
    await user.click(
      screen.getByRole("button", { name: "Use selected origin" })
    );
    rerender(
      <JobsProximityPanel
        active={false}
        filters={defaultFilters}
        limit={10}
        routeProximityLocationEnabled
        viewMode="list"
        onActiveChange={onActiveChange}
        onClearFilters={onClearFilters}
        onLimitChange={onLimitChange}
      />
    );

    placeDetailsRequest.resolve({
      origin: {
        coordinates: { latitude: 53.35, longitude: -6.27 },
        displayText: "Dublin",
        mode: "typed_origin",
        originToken: typedOriginToken,
        placeId: dublinPortPlaceId,
      },
    });

    await waitFor(() => {
      expect(mockedRankNearbyJobs).not.toHaveBeenCalled();
    });
  });

  it("clears stale origin suggestions before a later autocomplete failure", async () => {
    const user = userEvent.setup();
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      Effect.fail(
        new BrowserGeolocationPermissionDeniedError({
          message: "Location permission was denied.",
        })
      )
    );
    mockedAutocompleteProximityOrigin
      .mockReturnValueOnce(
        Effect.succeed({
          suggestions: [
            {
              displayText: "Dublin Port",
              placeId: dublinPortPlaceId,
              secondaryText: "Dublin, Ireland",
            },
          ],
        })
      )
      .mockReturnValueOnce(
        Effect.fail(
          new AppApiRequestError({
            message: "https://internal.example.test/places/autocomplete failed",
          })
        )
      );
    const { JobsProximityPanel } = await import("./jobs-proximity-panel");

    render(
      <ControlledJobsProximityPanel
        Component={JobsProximityPanel}
        filters={defaultFilters}
        limit={10}
        viewMode="list"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByText("Current location unavailable");
    await user.click(
      within(getProximityStatusPanel()).getByRole("button", {
        name: "Change origin",
      })
    );
    const originInput = screen.getByLabelText(
      "Search address, Eircode or place"
    );
    await user.type(originInput, "Dublin");
    await screen.findByRole("button", { name: /Dublin Port/ });
    await user.type(originInput, "x");

    await waitFor(() => {
      expect(mockedAutocompleteProximityOrigin).toHaveBeenCalledWith(
        expect.objectContaining({ input: "Dublinx" })
      );
    });
    expect(
      screen.queryByRole("button", { name: /Dublin Port/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/internal\.example/i)).not.toBeInTheDocument();
  });
});

function getProximityStatusPanel() {
  const panelTitle = screen.getByText("Current location unavailable");
  const panel = panelTitle.closest("[aria-live='polite']");

  expect(panel).not.toBeNull();

  return panel as HTMLElement;
}

type JobsProximityPanelComponent = React.ComponentType<JobsProximityPanelProps>;

function ControlledJobsProximityPanel({
  Component,
  routeProximityLocationEnabled = true,
  ...props
}: Omit<
  JobsProximityPanelProps,
  "active" | "onActiveChange" | "routeProximityLocationEnabled"
> & {
  readonly Component: JobsProximityPanelComponent;
  readonly routeProximityLocationEnabled?: boolean | undefined;
}) {
  const [active, setActive] = React.useState(false);

  return (
    <Component
      {...props}
      active={active}
      routeProximityLocationEnabled={routeProximityLocationEnabled}
      onActiveChange={setActive}
    />
  );
}

const userId = "user_123" as UserIdType;
const labelId = "label_123" as LabelIdType;
const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const jobId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const dublinPortPlaceId = "ChIJDublinPort" as GooglePlaceIdType;
const typedOriginToken =
  "v1.typedOrigin.testSignature" as TypedOrigin["originToken"];

const heatingLabel = {
  createdAt: "2026-06-06T09:00:00.000Z",
  id: labelId,
  name: "Heating",
  updatedAt: "2026-06-06T09:00:00.000Z",
};

const currentLocationOrigin = {
  accuracyMeters: 8,
  coordinates: { latitude: 53.3498, longitude: -6.2603 },
  mode: "current_location",
} satisfies ProximityOriginInput;

const defaultFilters = {
  assigneeId: { kind: "all" },
  coordinatorId: "all",
  labelId: "all",
  priority: "all",
  query: "",
  siteId: "all",
  status: "active",
} satisfies JobsListFilters;

function makeCurrentLocationRequest() {
  const pending = Promise.withResolvers<CurrentLocationOrigin>();
  const effect = Effect.promise(() => pending.promise);

  return {
    effect,
    resolve(origin: CurrentLocationOrigin) {
      pending.resolve(origin);
    },
  };
}

function makePlaceDetailsRequest() {
  const pending = Promise.withResolvers<ProximityOriginPlaceDetailsResponse>();
  const effect = Effect.promise(() => pending.promise);

  return {
    effect,
    resolve(response: ProximityOriginPlaceDetailsResponse) {
      pending.resolve(response);
    },
  };
}

function buildResponse(): JobProximityResponse {
  return {
    meta: {
      candidateCount: 1,
      candidateLimitApplied: false,
      excluded: [],
      rankedCandidateLimit: 100,
    },
    origin: {
      accuracyMeters: 8,
      computedAt: "2026-06-06T12:00:00.000Z",
      coordinates: { latitude: 53.3498, longitude: -6.2603 },
      displayText: "Current location",
      mode: "current_location",
    },
    rows: [
      {
        job: buildJob(),
        routeSummary: {
          computedAt: "2026-06-06T12:00:00.000Z",
          distanceMeters: 1800,
          durationSeconds: 840,
          provider: "google_routes",
          providerRequestKind: "matrix",
          routeStatus: "ok",
          trafficAware: true,
        },
        site: {
          displayLocation: "Dublin Estate",
          hasUsableCoordinates: true,
          id: siteId,
          labels: [heatingLabel],
          latitude: 53.36,
          locationStatus: "google_resolved",
          longitude: -6.24,
          name: "Dublin Estate",
          updatedAt: "2026-06-06T11:00:00.000Z",
        },
      },
    ],
  };
}

function buildJob(): JobListItem {
  return {
    createdAt: "2026-06-06T10:00:00.000Z",
    id: jobId,
    kind: "job",
    labels: [heatingLabel],
    priority: "urgent",
    siteId,
    status: "triaged",
    title: "Replace boiler pump",
    updatedAt: "2026-06-06T11:00:00.000Z",
  };
}
