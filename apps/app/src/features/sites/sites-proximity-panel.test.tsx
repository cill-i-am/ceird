import { setTimeout as delay } from "node:timers/promises";

import type {
  CurrentLocationOrigin,
  GooglePlaceIdType,
  ProximityOriginAutocompleteInput,
  ProximityOriginAutocompleteResponse,
  ProximityOriginInput,
  ProximityOriginPlaceDetailsInput,
  ProximityOriginPlaceDetailsResponse,
} from "@ceird/proximity-core";
import type {
  SiteIdType,
  SiteProximityInput,
  SiteProximityResponse,
} from "@ceird/sites-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import * as React from "react";
import type { ComponentProps } from "react";

import { AppApiRequestError } from "#/features/api/app-api-errors";
import type { AppApiError } from "#/features/api/app-api-errors";
import { BrowserGeolocationPermissionDeniedError } from "#/lib/browser-geolocation";
import type { BrowserGeolocationError } from "#/lib/browser-geolocation";

import type { SitesProximityPanelProps } from "./sites-proximity-panel";

const {
  mockedAutocompleteProximityOrigin,
  mockedRankNearbySites,
  mockedRequestCurrentLocationOrigin,
  mockedResolveProximityOriginPlace,
} = vi.hoisted(() => ({
  mockedAutocompleteProximityOrigin:
    vi.fn<
      (
        input: ProximityOriginAutocompleteInput
      ) => Effect.Effect<ProximityOriginAutocompleteResponse, AppApiError>
    >(),
  mockedRankNearbySites:
    vi.fn<
      (
        input: SiteProximityInput
      ) => Effect.Effect<SiteProximityResponse, AppApiError>
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
    rankNearbySites: mockedRankNearbySites,
    resolveProximityOriginPlace: mockedResolveProximityOriginPlace,
  };
});

vi.mock(import("#/features/proximity/proximity-location-access"), () => ({
  requestCurrentLocationOrigin: mockedRequestCurrentLocationOrigin,
}));

describe("sites proximity panel", () => {
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
    mockedRankNearbySites.mockReturnValue(Effect.succeed(buildResponse()));
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      Effect.succeed(currentLocationOrigin)
    );
    mockedResolveProximityOriginPlace.mockReturnValue(
      Effect.succeed({
        origin: {
          coordinates: { latitude: 53.35, longitude: -6.27 },
          displayText: "Dublin",
          mode: "typed_origin",
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
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <SitesProximityPanel
        active={false}
        limit={10}
        mapFilter="all"
        query=""
        routeProximityLocationEnabled
        onActiveChange={vi.fn<(active: boolean) => void>()}
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    expect(mockedRequestCurrentLocationOrigin).not.toHaveBeenCalled();
    expect(mockedRankNearbySites).not.toHaveBeenCalled();
  });

  it("does not request current location from URL-activated Near me until the user confirms", async () => {
    const user = userEvent.setup();
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <SitesProximityPanel
        active
        limit={10}
        mapFilter="all"
        query=""
        routeProximityLocationEnabled
        onActiveChange={vi.fn<(active: boolean) => void>()}
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    expect(mockedRequestCurrentLocationOrigin).not.toHaveBeenCalled();
    expect(mockedRankNearbySites).not.toHaveBeenCalled();
    expect(screen.getByText("Choose where routes start")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Use current location" })
    );

    await waitFor(() => {
      expect(mockedRankNearbySites).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: currentLocationOrigin,
        })
      );
    });
  });

  it("requests current location and ranks query-filtered mapped sites", async () => {
    const user = userEvent.setup();
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={25}
        mapFilter="mapped"
        query="boiler"
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(mockedRankNearbySites).toHaveBeenCalledWith({
        filters: { query: "boiler" },
        includeRouteLines: false,
        limit: 25,
        origin: currentLocationOrigin,
      });
    });
    await expect(
      screen.findByRole("heading", { name: "Dublin Estate" })
    ).resolves.toBeVisible();
    expect(screen.getByText("14 min")).toBeVisible();
  });

  it("uses typed-origin fallback without geolocation when location preference is disabled", async () => {
    const user = userEvent.setup();
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        routeProximityLocationEnabled={false}
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
    expect(mockedRankNearbySites).not.toHaveBeenCalled();
  });

  it("clears current-location results when location preference is disabled while active", async () => {
    const user = userEvent.setup();
    const { SitesProximityPanel } = await import("./sites-proximity-panel");
    const { rerender } = render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        routeProximityLocationEnabled
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByRole("heading", { name: "Dublin Estate" });

    rerender(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        routeProximityLocationEnabled={false}
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await expect(
      screen.findByText("Current location access is off")
    ).resolves.toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Dublin Estate" })
    ).not.toBeInTheDocument();
  });

  it("keeps ordinary site controls visible after route ranking succeeds", async () => {
    const user = userEvent.setup();
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      >
        <label htmlFor="sites-search-control">Search sites</label>
        <input id="sites-search-control" />
      </ControlledSitesProximityPanel>
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByRole("heading", { name: "Dublin Estate" });

    expect(screen.getByLabelText("Search sites")).toBeVisible();
  });

  it("does not call route ranking when the unmapped filter is active", async () => {
    const user = userEvent.setup();
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="unmapped"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await expect(
      screen.findByText("Nearby sites are mapped sites")
    ).resolves.toBeVisible();
    expect(mockedRankNearbySites).not.toHaveBeenCalled();
  });

  it("shows safe copy instead of raw transport failures", async () => {
    const user = userEvent.setup();
    mockedRankNearbySites.mockReturnValue(
      Effect.fail(
        new AppApiRequestError({
          message: "https://internal.example.test/google/routes failed",
        })
      )
    );
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await expect(
      screen.findByText("Nearby sites could not be ranked")
    ).resolves.toBeVisible();
    expect(
      screen.getByText(
        "The route provider could not calculate traffic-aware driving times. Ordinary sites are still available."
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
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
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
    expect(mockedRankNearbySites).not.toHaveBeenCalled();
  });

  it("interrupts a live current-location request when Near me is disabled", async () => {
    const user = userEvent.setup();
    const currentLocationRequest = makeNeverCurrentLocationRequest();
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      currentLocationRequest.effect
    );
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await waitFor(() => {
      expect(mockedRequestCurrentLocationOrigin).toHaveBeenCalledOnce();
    });
    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(currentLocationRequest.wasInterrupted()).toBeTruthy();
    });
  });

  it("ignores stale current-location results after Near me is disabled", async () => {
    const user = userEvent.setup();
    const firstOriginRequest = makeCurrentLocationRequest();
    mockedRequestCurrentLocationOrigin
      .mockReturnValueOnce(firstOriginRequest.effect)
      .mockReturnValue(Effect.succeed(currentLocationOrigin));
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await user.click(screen.getByRole("button", { name: /near me/i }));
    firstOriginRequest.resolve(currentLocationOrigin);
    await delay(450);

    expect(mockedRankNearbySites).not.toHaveBeenCalled();
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
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByText("Current location unavailable");
    await user.click(
      within(screen.getByRole("status")).getByRole("button", {
        name: "Change origin",
      })
    );
    await user.type(
      screen.getByLabelText("Search address, Eircode or place"),
      "Dublin"
    );
    await user.click(
      await screen.findByRole("option", { name: /Dublin Port/ })
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
    const { SitesProximityPanel } = await import("./sites-proximity-panel");
    const onActiveChange = vi.fn<(active: boolean) => void>();
    const onClearFilters = vi.fn<() => void>();
    const onLimitChange = vi.fn<(limit: 10 | 15 | 20 | 25) => void>();
    const { rerender } = render(
      <SitesProximityPanel
        active
        limit={10}
        mapFilter="all"
        query=""
        routeProximityLocationEnabled
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
      within(screen.getByRole("status")).getByRole("button", {
        name: "Change origin",
      })
    );
    await user.type(
      screen.getByLabelText("Search address, Eircode or place"),
      "Dublin"
    );
    await user.click(
      await screen.findByRole("option", { name: /Dublin Port/ })
    );
    await user.click(
      screen.getByRole("button", { name: "Use selected origin" })
    );
    rerender(
      <SitesProximityPanel
        active={false}
        limit={10}
        mapFilter="all"
        query=""
        routeProximityLocationEnabled
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
        placeId: dublinPortPlaceId,
      },
    });
    await delay(450);

    expect(mockedRankNearbySites).not.toHaveBeenCalled();
  });

  it("ignores autocomplete failures without showing raw provider errors", async () => {
    const user = userEvent.setup();
    mockedRequestCurrentLocationOrigin.mockReturnValue(
      Effect.fail(
        new BrowserGeolocationPermissionDeniedError({
          message: "Location permission was denied.",
        })
      )
    );
    mockedAutocompleteProximityOrigin.mockReturnValue(
      Effect.fail(
        new AppApiRequestError({
          message: "https://internal.example.test/places/autocomplete failed",
        })
      )
    );
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByText("Current location unavailable");
    await user.click(
      within(screen.getByRole("status")).getByRole("button", {
        name: "Change origin",
      })
    );
    await user.type(
      screen.getByLabelText("Search address, Eircode or place"),
      "Dublin"
    );

    await waitFor(() => {
      expect(mockedAutocompleteProximityOrigin).toHaveBeenCalledWith(
        expect.objectContaining({ input: "Dublin" })
      );
    });
    expect(
      screen.getByText("Search and select a result before running Near me.")
    ).toBeVisible();
    expect(screen.queryByText(/internal\.example/i)).not.toBeInTheDocument();
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
    const { SitesProximityPanel } = await import("./sites-proximity-panel");

    render(
      <ControlledSitesProximityPanel
        Component={SitesProximityPanel}
        limit={10}
        mapFilter="all"
        query=""
        onClearFilters={vi.fn<() => void>()}
        onLimitChange={vi.fn<(limit: 10 | 15 | 20 | 25) => void>()}
      />
    );

    await user.click(screen.getByRole("button", { name: /near me/i }));
    await screen.findByText("Current location unavailable");
    await user.click(
      within(screen.getByRole("status")).getByRole("button", {
        name: "Change origin",
      })
    );
    const originInput = screen.getByLabelText(
      "Search address, Eircode or place"
    );
    await user.type(originInput, "Dublin");
    await screen.findByRole("option", { name: /Dublin Port/ });
    await user.type(originInput, "x");

    await waitFor(() => {
      expect(mockedAutocompleteProximityOrigin).toHaveBeenCalledWith(
        expect.objectContaining({ input: "Dublinx" })
      );
    });
    expect(
      screen.queryByRole("option", { name: /Dublin Port/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/internal\.example/i)).not.toBeInTheDocument();
  });
});

type SitesProximityPanelComponent =
  React.ComponentType<SitesProximityPanelProps>;

function ControlledSitesProximityPanel({
  children,
  Component,
  routeProximityLocationEnabled = true,
  ...props
}: Omit<
  SitesProximityPanelProps,
  "active" | "onActiveChange" | "routeProximityLocationEnabled"
> & {
  readonly children?: React.ReactNode;
  readonly Component: SitesProximityPanelComponent;
  readonly routeProximityLocationEnabled?: boolean | undefined;
}) {
  const [active, setActive] = React.useState(false);

  return (
    <Component
      {...props}
      active={active}
      routeProximityLocationEnabled={routeProximityLocationEnabled}
      onActiveChange={setActive}
    >
      {children}
    </Component>
  );
}

const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const dublinPortPlaceId = "ChIJDublinPort" as GooglePlaceIdType;

const currentLocationOrigin = {
  accuracyMeters: 8,
  coordinates: { latitude: 53.3498, longitude: -6.2603 },
  mode: "current_location",
} satisfies ProximityOriginInput;

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

function makeNeverCurrentLocationRequest() {
  let interrupted = false;
  const effect = Effect.never.pipe(
    Effect.ensuring(
      Effect.sync(() => {
        interrupted = true;
      })
    )
  ) as Effect.Effect<CurrentLocationOrigin, BrowserGeolocationError>;

  return {
    effect,
    wasInterrupted() {
      return interrupted;
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

function buildResponse(): SiteProximityResponse {
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
        activeJobCount: 2,
        highestActiveJobPriority: "urgent",
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
          labels: [],
          latitude: 53.36,
          locationStatus: "google_resolved",
          longitude: -6.24,
          name: "Dublin Estate",
        },
      },
    ],
  };
}
