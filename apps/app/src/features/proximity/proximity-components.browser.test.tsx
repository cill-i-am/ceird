import type {
  ProximityOriginSuggestion,
  ProximityOriginSummary,
  RouteSummary,
} from "@ceird/proximity-core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProximityLimitSelect } from "./proximity-limit-select";
import { ProximityOriginDialog } from "./proximity-origin-dialog";
import { ProximityResultCard } from "./proximity-result-card";
import { ProximityResultRow } from "./proximity-result-row";
import { ProximityStatusPanel } from "./proximity-status-panel";

const routeSummary = {
  computedAt: "2026-06-06T08:41:00.000Z",
  distanceMeters: 3200,
  durationSeconds: 480,
  provider: "google_routes",
  providerRequestKind: "matrix",
  routeStatus: "ok",
  trafficAware: true,
} satisfies RouteSummary;

const origin = {
  accuracyMeters: 18,
  computedAt: "2026-06-06T08:41:00.000Z",
  coordinates: {
    latitude: 53.349_805,
    longitude: -6.260_31,
  },
  displayText: "Current location",
  mode: "current_location",
} satisfies ProximityOriginSummary;

const suggestion = {
  displayText: "Dublin Port",
  placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  secondaryText: "Dublin, Ireland",
} as ProximityOriginSuggestion;

describe("proximity components", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the compact route limit selector with the supported values", async () => {
    const user = userEvent.setup();
    const onLimitChange = vi.fn<(limit: 10 | 15 | 20 | 25) => void>();

    render(<ProximityLimitSelect value={10} onLimitChange={onLimitChange} />);

    await user.selectOptions(screen.getByLabelText("Route result limit"), "25");

    expect(onLimitChange).toHaveBeenCalledWith(25);
    expect(screen.getByRole("option", { name: "25 (max)" })).toBeVisible();
  });

  it("requires a selected typed origin before confirming fallback origin search", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<(suggestion: ProximityOriginSuggestion) => void>();
    const onSuggestionSelect =
      vi.fn<(suggestion: ProximityOriginSuggestion) => void>();

    const { rerender } = render(
      <ProximityOriginDialog
        open
        query="Dublin"
        selectedSuggestion={null}
        suggestions={[suggestion]}
        onConfirm={onConfirm}
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onQueryChange={vi.fn<(query: string) => void>()}
        onSuggestionSelect={onSuggestionSelect}
      />
    );

    expect(
      screen.getByRole("button", { name: "Use selected origin" })
    ).toBeDisabled();
    expect(screen.getByText("Dublin Port")).toBeVisible();

    await user.click(screen.getByRole("option", { name: /Dublin Port/ }));
    expect(onSuggestionSelect).toHaveBeenCalledWith(suggestion);

    rerender(
      <ProximityOriginDialog
        open
        query="Dublin"
        selectedSuggestion={suggestion}
        suggestions={[suggestion]}
        onConfirm={onConfirm}
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onQueryChange={vi.fn<(query: string) => void>()}
        onSuggestionSelect={onSuggestionSelect}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Use selected origin" })
    );

    expect(onConfirm).toHaveBeenCalledWith(suggestion);
  });

  it("renders route-ranked rows with drive time as the primary scan value and maps handoff", () => {
    const userAgentSpy = vi
      .spyOn(window.navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (Linux; Android 15; Pixel)");

    render(
      <ProximityResultRow
        destination={{
          coordinates: { latitude: 53.351, longitude: -6.255 },
          label: "14 Willow Close",
        }}
        detailAction={<button type="button">View job</button>}
        meta={<span>Urgent</span>}
        origin={origin}
        rank={1}
        routeSummary={routeSummary}
        selected
        subtitle="Oakfield Estate"
        title="14 Willow Close"
      />
    );

    expect(screen.getByText("8 min")).toBeVisible();
    expect(screen.getByText("3.2 km")).toBeVisible();
    expect(screen.getByText("Traffic-aware")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open in Maps" })).toHaveAttribute(
      "href",
      expect.stringContaining("travelmode=driving")
    );
    expect(screen.getByRole("button", { name: "View job" })).toBeVisible();
    userAgentSpy.mockRestore();
  });

  it("selects route-ranked rows when users scan them with pointer or focus", () => {
    const onSelect = vi.fn<() => void>();
    render(
      <ProximityResultRow
        destination={{
          coordinates: { latitude: 53.351, longitude: -6.255 },
          label: "14 Willow Close",
        }}
        origin={origin}
        rank={1}
        routeSummary={routeSummary}
        title="14 Willow Close"
        onSelect={onSelect}
      />
    );
    const row = screen.getByText("14 Willow Close").closest("article");

    expect(row).toBeInstanceOf(HTMLElement);
    fireEvent.pointerEnter(row as HTMLElement);
    screen.getByRole("link", { name: "Open in Maps" }).focus();

    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("renders compact route result cards for mobile and agent surfaces", () => {
    render(
      <ProximityResultCard
        destination={{
          coordinates: { latitude: 53.351, longitude: -6.255 },
          label: "14 Willow Close",
        }}
        origin={origin}
        rank={2}
        routeSummary={routeSummary}
        title="14 Willow Close"
      />
    );

    expect(screen.getByLabelText("Rank 2")).toBeVisible();
    expect(screen.getByText("8 min")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open in Maps" })).toBeVisible();
  });

  it("renders explicit operational states for route failures", () => {
    render(
      <ProximityStatusPanel
        action={<button type="button">Change origin</button>}
        state={{
          description:
            "Ceird could not calculate traffic-aware driving routes right now.",
          kind: "provider_unavailable",
          title: "Routes unavailable",
        }}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Routes unavailable");
    expect(screen.getByRole("button", { name: "Change origin" })).toBeVisible();
  });
});
