import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import type MapLibreGL from "maplibre-gl";

import { ShortcutHelpOverlay } from "#/hotkeys/shortcut-help-overlay";

import {
  Map,
  MapControls,
  MapFitBounds,
  MapFitRouteBounds,
  MapRouteLine,
} from "./map";

const {
  mockedAddLayer,
  mockedAddSource,
  mockedBoundsExtend,
  mockedEaseTo,
  mockedExitFullscreen,
  mockedFitBounds,
  mockedFlyTo,
  mockedRequestBrowserGeolocation,
  mockedRequestFullscreen,
  mockedRemoveLayer,
  mockedRemoveSource,
  mockedResetNorthPitch,
  mockedSetSourceData,
  mockedLayerEventHandlers,
  mockedZoomTo,
} = vi.hoisted(() => ({
  mockedAddLayer: vi.fn<(layer: unknown, before?: string) => void>(),
  mockedAddSource: vi.fn<(id: string, source: unknown) => void>(),
  mockedBoundsExtend: vi.fn<(coordinate: [number, number]) => void>(),
  mockedEaseTo: vi.fn<(options: unknown) => void>(),
  mockedExitFullscreen: vi.fn<() => Promise<void>>(),
  mockedFitBounds: vi.fn<(bounds: unknown, options: unknown) => void>(),
  mockedFlyTo:
    vi.fn<
      (options: {
        center: [number, number];
        duration: number;
        zoom: number;
      }) => void
    >(),
  mockedRequestBrowserGeolocation: vi.fn<
    () => Effect.Effect<{
      readonly latitude: number;
      readonly longitude: number;
    }>
  >(),
  mockedRequestFullscreen: vi.fn<() => Promise<void>>(),
  mockedRemoveLayer: vi.fn<(id: string) => void>(),
  mockedRemoveSource: vi.fn<(id: string) => void>(),
  mockedResetNorthPitch: vi.fn<(options: { duration: number }) => void>(),
  mockedSetSourceData: vi.fn<(id: string, data: unknown) => void>(),
  mockedLayerEventHandlers: new globalThis.Map<
    string,
    Set<(event: unknown) => void>
  >(),
  mockedZoomTo:
    vi.fn<(nextZoom: number, options: { duration: number }) => void>(),
}));

vi.mock(import("#/lib/browser-geolocation"), () => ({
  requestBrowserGeolocation: mockedRequestBrowserGeolocation,
}));

function MockLngLatBounds() {
  void mockedBoundsExtend;
}

MockLngLatBounds.prototype.extend = function extend(
  coordinate: [number, number]
) {
  mockedBoundsExtend(coordinate);
  return this;
};

function MockMarker() {
  return null;
}

function MockPopup() {
  return null;
}

vi.mock(import("maplibre-gl"), () => {
  type MockEventHandler = (event?: unknown) => void;
  interface MockSource {
    readonly setData: (data: unknown) => void;
  }

  class MockMap {
    private bearing = 0;
    private readonly canvas: HTMLCanvasElement;
    private readonly container: HTMLElement;
    private readonly eventHandlers = new globalThis.Map<
      string,
      Set<MockEventHandler>
    >();
    private readonly layers = new globalThis.Map<string, unknown>();
    private pitch = 0;
    private readonly sources = new globalThis.Map<string, MockSource>();
    private zoom: number;

    constructor(options: { container: HTMLElement; zoom?: number }) {
      this.container = options.container;
      this.zoom = options.zoom ?? 0;
      this.container.requestFullscreen = mockedRequestFullscreen;
      this.canvas = document.createElement("canvas");
      this.canvas.tabIndex = 0;
      this.container.append(this.canvas);
    }

    addLayer(layer: { id: string }, before?: string) {
      this.layers.set(layer.id, layer);
      mockedAddLayer(layer, before);
      return this;
    }

    addSource(id: string, source: { data?: unknown }) {
      const mockSource = {
        setData: (data: unknown) => {
          mockedSetSourceData(id, data);
        },
      };
      this.sources.set(id, mockSource);
      mockedAddSource(id, source);
      return this;
    }

    easeTo(options: unknown) {
      void this.container;
      mockedEaseTo(options);
    }

    fitBounds(bounds: unknown, options: unknown) {
      void this.container;
      mockedFitBounds(bounds, options);
    }

    flyTo(options: {
      center: [number, number];
      duration: number;
      zoom: number;
    }) {
      void this.container;
      mockedFlyTo(options);
    }

    getBearing() {
      return this.bearing;
    }

    getCenter() {
      void this.container;
      return { lat: 0, lng: 0 };
    }

    getCanvas() {
      return this.canvas;
    }

    getContainer() {
      return this.container;
    }

    getLayer(id: string) {
      return this.layers.get(id);
    }

    getPitch() {
      return this.pitch;
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    getZoom() {
      return this.zoom;
    }

    isMoving() {
      void this.container;
      return false;
    }

    jumpTo() {
      void this.container;
    }

    off(
      event: string,
      layerOrHandler: MockEventHandler | string,
      maybeHandler?: MockEventHandler
    ) {
      if (typeof layerOrHandler === "string") {
        const key = `${event}:${layerOrHandler}`;
        const handlers = mockedLayerEventHandlers.get(key);
        if (handlers && maybeHandler) {
          handlers.delete(maybeHandler);
        }
        return;
      }

      this.eventHandlers.get(event)?.delete(layerOrHandler);
    }

    on(
      event: string,
      layerOrHandler: MockEventHandler | string,
      maybeHandler?: MockEventHandler
    ) {
      if (typeof layerOrHandler === "string") {
        const key = `${event}:${layerOrHandler}`;
        const handlers = mockedLayerEventHandlers.get(key) ?? new Set();
        if (maybeHandler) {
          handlers.add(maybeHandler);
        }
        mockedLayerEventHandlers.set(key, handlers);
        return;
      }

      const handler = layerOrHandler;
      const handlers = this.eventHandlers.get(event) ?? new Set();
      handlers.add(handler);
      this.eventHandlers.set(event, handlers);

      if (event === "load" || event === "styledata") {
        queueMicrotask(handler);
      }
    }

    remove() {
      void this.container;
    }

    removeLayer(id: string) {
      this.layers.delete(id);
      mockedRemoveLayer(id);
    }

    removeSource(id: string) {
      this.sources.delete(id);
      mockedRemoveSource(id);
    }

    resetNorthPitch(options: { duration: number }) {
      this.bearing = 0;
      this.pitch = 0;
      mockedResetNorthPitch(options);
    }

    setProjection() {
      void this.container;
    }

    setStyle() {
      const handlers = this.eventHandlers.get("styledata");

      if (handlers !== undefined) {
        for (const handler of handlers) {
          queueMicrotask(handler);
        }
      }
    }

    zoomTo(nextZoom: number, options: { duration: number }) {
      this.zoom = nextZoom;
      mockedZoomTo(nextZoom, options);
    }
  }

  const mapLibreMock = {
    LngLatBounds: MockLngLatBounds as unknown as typeof MapLibreGL.LngLatBounds,
    Map: MockMap as unknown as typeof MapLibreGL.Map,
    Marker: MockMarker as unknown as typeof MapLibreGL.Marker,
    Popup: MockPopup as unknown as typeof MapLibreGL.Popup,
  } as typeof MapLibreGL;

  return {
    ...mapLibreMock,
    default: mapLibreMock,
  };
});

describe("map controls hotkeys", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn<(query: string) => MediaQueryList>((query) => ({
        addEventListener: vi.fn<() => void>(),
        addListener: vi.fn<() => void>(),
        dispatchEvent: vi.fn<() => boolean>(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
      })),
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: mockedExitFullscreen,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    mockedExitFullscreen.mockResolvedValue();
    mockedRequestFullscreen.mockResolvedValue();
    mockedRequestBrowserGeolocation.mockReturnValue(
      Effect.succeed({ latitude: 53.3498, longitude: -6.2603 })
    );
    mockedAddLayer.mockClear();
    mockedAddSource.mockClear();
    mockedBoundsExtend.mockClear();
    mockedEaseTo.mockClear();
    mockedFitBounds.mockClear();
    mockedRemoveLayer.mockClear();
    mockedRemoveSource.mockClear();
    mockedSetSourceData.mockClear();
    mockedLayerEventHandlers.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function getMapCanvas() {
    const mapRegion = screen.getByRole("region", {
      name: "Interactive map",
    });
    const canvas = mapRegion.querySelector("canvas");

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);

    return canvas as HTMLCanvasElement;
  }

  it("runs visible map controls from their hotkeys and lists them in shortcut help", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { rerender } = render(
      <HotkeysProvider>
        <Map center={[0, 0]} zoom={3}>
          <MapControls controls={["zoom", "compass", "locate", "fullscreen"]} />
        </Map>
      </HotkeysProvider>
    );

    await screen.findByRole("button", { name: "Zoom in" });
    const mapCanvas = getMapCanvas();

    fireEvent.keyDown(document, { key: "=", shiftKey: true });
    expect(mockedZoomTo).not.toHaveBeenCalled();

    mapCanvas.focus();
    fireEvent.keyDown(mapCanvas, { key: "=", shiftKey: true });
    fireEvent.keyDown(mapCanvas, { key: "-" });
    fireEvent.keyDown(mapCanvas, { key: "0" });
    fireEvent.keyDown(mapCanvas, { key: "l" });
    fireEvent.keyDown(mapCanvas, { key: "f" });

    expect(mockedZoomTo).toHaveBeenNthCalledWith(1, 4, { duration: 300 });
    expect(mockedZoomTo).toHaveBeenNthCalledWith(2, 3, { duration: 300 });
    expect(mockedResetNorthPitch).toHaveBeenCalledWith({ duration: 300 });
    await waitFor(() => {
      expect(mockedFlyTo).toHaveBeenCalledWith({
        center: [-6.2603, 53.3498],
        duration: 1500,
        zoom: 14,
      });
    });
    expect(mockedRequestFullscreen).toHaveBeenCalledOnce();

    rerender(
      <HotkeysProvider>
        <Map center={[0, 0]} zoom={3}>
          <MapControls controls={["zoom", "compass", "locate", "fullscreen"]} />
          <ShortcutHelpOverlay activeScopes={["map"]} />
        </Map>
      </HotkeysProvider>
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Zoom in")).toBeVisible();
    expect(within(dialog).getByText("Zoom out")).toBeVisible();
    expect(within(dialog).getByText("Reset bearing")).toBeVisible();
    expect(within(dialog).getByText("Locate")).toBeVisible();
    expect(within(dialog).getByText("Fullscreen")).toBeVisible();
    expect(
      consoleErrorSpy.mock.calls.map((call) => call.join(" ")).join("\n")
    ).not.toContain("Cannot update a component");
  }, 10_000);

  it("does not run or list map shortcuts for controls that are not rendered", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <Map center={[0, 0]} zoom={3}>
          <MapControls controls={[]} />
          <ShortcutHelpOverlay activeScopes={["map"]} />
        </Map>
      </HotkeysProvider>
    );

    await screen.findByRole("button", { name: /keyboard shortcuts/i });
    const mapCanvas = getMapCanvas();

    mapCanvas.focus();
    fireEvent.keyDown(mapCanvas, { key: "=", shiftKey: true });
    fireEvent.keyDown(mapCanvas, { key: "-" });
    fireEvent.keyDown(mapCanvas, { key: "0" });
    fireEvent.keyDown(mapCanvas, { key: "l" });
    fireEvent.keyDown(mapCanvas, { key: "f" });

    expect(mockedZoomTo).not.toHaveBeenCalled();
    expect(mockedResetNorthPitch).not.toHaveBeenCalled();
    expect(mockedRequestBrowserGeolocation).not.toHaveBeenCalled();
    expect(mockedRequestFullscreen).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).queryByText("Zoom in")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Locate")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Fullscreen")).not.toBeInTheDocument();
  }, 10_000);
});

describe("map route line", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn<(query: string) => MediaQueryList>((query) => ({
        addEventListener: vi.fn<() => void>(),
        addListener: vi.fn<() => void>(),
        dispatchEvent: vi.fn<() => boolean>(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
      })),
    });
    mockedAddLayer.mockClear();
    mockedAddSource.mockClear();
    mockedRemoveLayer.mockClear();
    mockedRemoveSource.mockClear();
    mockedSetSourceData.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("adds a GeoJSON source and line layer once the map style is ready", async () => {
    render(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapRouteLine
          id="nearest-job-route"
          beforeId="job-markers"
          color="#0f766e"
          coordinates={[
            [-6.2603, 53.3498],
            [-6.251, 53.343],
            [-6.244, 53.338],
          ]}
          width={5}
        />
      </Map>
    );

    await waitFor(() => {
      expect(mockedAddSource).toHaveBeenCalledWith(
        "nearest-job-route-source",
        expect.objectContaining({
          data: expect.objectContaining({
            geometry: {
              coordinates: [
                [-6.2603, 53.3498],
                [-6.251, 53.343],
                [-6.244, 53.338],
              ],
              type: "LineString",
            },
            type: "Feature",
          }),
          type: "geojson",
        })
      );
    });

    expect(mockedAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "nearest-job-route-layer",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: expect.objectContaining({
          "line-color": "#0f766e",
          "line-width": 5,
        }),
        source: "nearest-job-route-source",
        type: "line",
      }),
      "job-markers"
    );
  });

  it("updates route geometry without rebuilding the map layer", async () => {
    const { rerender } = render(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapRouteLine
          id="selected-route"
          coordinates={[
            [-6.2603, 53.3498],
            [-6.251, 53.343],
          ]}
        />
      </Map>
    );

    await waitFor(() => {
      expect(mockedAddLayer).toHaveBeenCalledOnce();
    });

    rerender(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapRouteLine
          id="selected-route"
          coordinates={[
            [-6.2603, 53.3498],
            [-6.22, 53.331],
          ]}
        />
      </Map>
    );

    await waitFor(() => {
      expect(mockedSetSourceData).toHaveBeenCalledWith(
        "selected-route-source",
        expect.objectContaining({
          geometry: {
            coordinates: [
              [-6.2603, 53.3498],
              [-6.22, 53.331],
            ],
            type: "LineString",
          },
        })
      );
    });

    expect(mockedAddLayer).toHaveBeenCalledOnce();
    expect(mockedRemoveLayer).not.toHaveBeenCalledWith("selected-route-layer");
  });

  it("lets feature code select a row from a route line click", async () => {
    const onRouteClick = vi.fn<() => void>();

    render(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapRouteLine
          id="interactive-route"
          coordinates={[
            [-6.2603, 53.3498],
            [-6.251, 53.343],
          ]}
          onClick={onRouteClick}
        />
      </Map>
    );

    await waitFor(() => {
      expect(mockedAddLayer).toHaveBeenCalledOnce();
    });

    const routeClickHandlers = mockedLayerEventHandlers.get(
      "click:interactive-route-layer"
    );
    if (routeClickHandlers) {
      for (const handler of routeClickHandlers) {
        handler({ type: "click" });
      }
    }

    expect(onRouteClick).toHaveBeenCalledOnce();
  });

  it("fits route bounds from coordinates inside the map primitive", async () => {
    render(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapFitRouteBounds
          coordinates={[
            [-6.2603, 53.3498],
            [-6.251, 53.343],
          ]}
          maxZoom={14}
          padding={32}
        />
      </Map>
    );

    await waitFor(() => {
      expect(mockedFitBounds).toHaveBeenCalledWith(expect.anything(), {
        duration: 0,
        maxZoom: 14,
        padding: 32,
      });
    });

    expect(mockedBoundsExtend).toHaveBeenNthCalledWith(1, [-6.2603, 53.3498]);
    expect(mockedBoundsExtend).toHaveBeenNthCalledWith(2, [-6.251, 53.343]);
  });

  it("eases to one coordinate from inside the map primitive", async () => {
    render(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapFitBounds
          coordinates={[[-6.251, 53.343]]}
          duration={600}
          singleZoom={11}
        />
      </Map>
    );

    await waitFor(() => {
      expect(mockedEaseTo).toHaveBeenCalledWith({
        center: [-6.251, 53.343],
        duration: 600,
        zoom: 11,
      });
    });

    expect(mockedFitBounds).not.toHaveBeenCalled();
  });

  it("removes its layer and source when unmounted", async () => {
    const { unmount } = render(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapRouteLine
          id="preview-route"
          coordinates={[
            [-6.2603, 53.3498],
            [-6.251, 53.343],
          ]}
        />
      </Map>
    );

    await waitFor(() => {
      expect(mockedAddLayer).toHaveBeenCalledOnce();
    });

    unmount();

    expect(mockedRemoveLayer).toHaveBeenCalledWith("preview-route-layer");
    expect(mockedRemoveSource).toHaveBeenCalledWith("preview-route-source");
  });

  it("does not create a route layer without at least two coordinates", async () => {
    render(
      <Map center={[-6.2603, 53.3498]} zoom={12}>
        <MapRouteLine id="empty-route" coordinates={[[-6.2603, 53.3498]]} />
      </Map>
    );

    await waitFor(() => {
      expect(mockedAddLayer).not.toHaveBeenCalled();
    });
    expect(mockedAddSource).not.toHaveBeenCalled();
  });
});
