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

import { Map, MapControls } from "./map";

const {
  mockedExitFullscreen,
  mockedFlyTo,
  mockedRequestBrowserGeolocation,
  mockedRequestFullscreen,
  mockedResetNorthPitch,
  mockedZoomTo,
} = vi.hoisted(() => ({
  mockedExitFullscreen: vi.fn<() => Promise<void>>(),
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
  mockedResetNorthPitch: vi.fn<(options: { duration: number }) => void>(),
  mockedZoomTo:
    vi.fn<(nextZoom: number, options: { duration: number }) => void>(),
}));

vi.mock(import("#/lib/browser-geolocation"), () => ({
  requestBrowserGeolocation: mockedRequestBrowserGeolocation,
}));

function MockLngLatBounds() {
  return null;
}

function MockMarker() {
  return null;
}

function MockPopup() {
  return null;
}

vi.mock(import("maplibre-gl"), () => {
  class MockMap {
    private bearing = 0;
    private readonly canvas: HTMLCanvasElement;
    private readonly container: HTMLElement;
    private pitch = 0;
    private zoom: number;

    constructor(options: { container: HTMLElement; zoom?: number }) {
      this.container = options.container;
      this.zoom = options.zoom ?? 0;
      this.container.requestFullscreen = mockedRequestFullscreen;
      this.canvas = document.createElement("canvas");
      this.canvas.tabIndex = 0;
      this.container.append(this.canvas);
    }

    easeTo() {
      void this.container;
    }

    fitBounds() {
      void this.container;
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

    getPitch() {
      return this.pitch;
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

    off() {
      void this.container;
    }

    on() {
      void this.container;
    }

    remove() {
      void this.container;
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
      void this.container;
    }

    zoomTo(nextZoom: number, options: { duration: number }) {
      this.zoom = nextZoom;
      mockedZoomTo(nextZoom, options);
    }
  }

  return {
    default: {
      LngLatBounds:
        MockLngLatBounds as unknown as typeof MapLibreGL.LngLatBounds,
      Map: MockMap as unknown as typeof MapLibreGL.Map,
      Marker: MockMarker as unknown as typeof MapLibreGL.Marker,
      Popup: MockPopup as unknown as typeof MapLibreGL.Popup,
    },
  } as unknown as { default: typeof MapLibreGL };
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
  });

  afterEach(() => {
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
