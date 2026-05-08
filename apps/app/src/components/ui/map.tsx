"use client";
/* oxlint-disable eqeqeq, no-eq-null, no-inline-comments, prefer-destructuring, react/jsx-no-constructed-context-values */

import { Cause, Effect, Exit, Option } from "effect";

import "maplibre-gl/dist/maplibre-gl.css";
import { X, Minus, Plus, Locate, Maximize } from "lucide-react";
import MapLibreGL from "maplibre-gl";
import type { PopupOptions, MarkerOptions } from "maplibre-gl";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, Ref } from "react";
import { createPortal } from "react-dom";

import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { requestBrowserGeolocation } from "#/lib/browser-geolocation";
import type { BrowserGeolocationError } from "#/lib/browser-geolocation";
import { cn } from "#/lib/utils";

import { DotMatrixButtonLoader } from "./dot-matrix-loader";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const defaultStyles = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

type Theme = "light" | "dark";

// Check document class for theme (works with next-themes, etc.)
function getDocumentTheme(): Theme | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  if (document.documentElement.classList.contains("light")) {
    return "light";
  }
  return null;
}

// Get system preference
function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function useResolvedTheme(themeProp?: "light" | "dark"): Theme {
  const [detectedTheme, setDetectedTheme] = useState<Theme>(
    () => getDocumentTheme() ?? getSystemTheme()
  );

  useEffect(() => {
    if (themeProp) {
      return;
    } // Skip detection if theme is provided via prop

    // Watch for document class changes (e.g., next-themes toggling dark class)
    const observer = new MutationObserver(() => {
      const docTheme = getDocumentTheme();
      if (docTheme) {
        setDetectedTheme(docTheme);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Also watch for system preference changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = (e: MediaQueryListEvent) => {
      // Only use system preference if no document class is set
      if (!getDocumentTheme()) {
        setDetectedTheme(e.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handleSystemChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleSystemChange);
    };
  }, [themeProp]);

  return themeProp ?? detectedTheme;
}

interface MapContextValue {
  map: MapLibreGL.Map | null;
  isLoaded: boolean;
}

const MapContext = createContext<MapContextValue | null>(null);

function useMap() {
  const context = use(MapContext);
  if (!context) {
    throw new Error("useMap must be used within a Map component");
  }
  return context;
}

/** Map viewport state */
interface MapViewport {
  /** Center coordinates [longitude, latitude] */
  center: [number, number];
  /** Zoom level */
  zoom: number;
  /** Bearing (rotation) in degrees */
  bearing: number;
  /** Pitch (tilt) in degrees */
  pitch: number;
}

type MapStyleOption = string | MapLibreGL.StyleSpecification;

type MapRef = MapLibreGL.Map | null;

type MapProps = {
  children?: ReactNode;
  ref?: Ref<MapRef>;
  /** Additional CSS classes for the map container */
  className?: string;
  /**
   * Theme for the map. If not provided, automatically detects system preference.
   * Pass your theme value here.
   */
  theme?: Theme;
  /** Custom map styles for light and dark themes. Overrides the default Carto styles. */
  styles?: {
    light?: MapStyleOption;
    dark?: MapStyleOption;
  };
  /** Map projection type. Use `{ type: "globe" }` for 3D globe view. */
  projection?: MapLibreGL.ProjectionSpecification;
  /**
   * Controlled viewport. When provided with onViewportChange,
   * the map becomes controlled and viewport is driven by this prop.
   */
  viewport?: Partial<MapViewport>;
  /**
   * Callback fired continuously as the viewport changes (pan, zoom, rotate, pitch).
   * Can be used standalone to observe changes, or with `viewport` prop
   * to enable controlled mode where the map viewport is driven by your state.
   */
  onViewportChange?: (viewport: MapViewport) => void;
  /** Show a loading indicator on the map */
  loading?: boolean;
} & Omit<MapLibreGL.MapOptions, "container" | "style">;

function DefaultLoader() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-xs">
      <div className="flex gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function getViewport(map: MapLibreGL.Map): MapViewport {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

function Map({
  children,
  className,
  ref,
  theme: themeProp,
  styles,
  projection,
  viewport,
  onViewportChange,
  loading = false,
  ...props
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreGL.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isStyleLoaded, setIsStyleLoaded] = useState(false);
  const currentStyleRef = useRef<MapStyleOption | null>(null);
  const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalUpdateRef = useRef(false);
  const resolvedTheme = useResolvedTheme(themeProp);

  const isControlled = viewport !== undefined && onViewportChange !== undefined;

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const mapStyles = useMemo(
    () => ({
      dark: styles?.dark ?? defaultStyles.dark,
      light: styles?.light ?? defaultStyles.light,
    }),
    [styles]
  );

  // Expose the map instance to the parent component once MapLibre has mounted.
  useImperativeHandle<MapRef, MapRef>(ref, () => mapInstance, [mapInstance]);

  const clearStyleTimeout = useCallback(() => {
    if (styleTimeoutRef.current) {
      clearTimeout(styleTimeoutRef.current);
      styleTimeoutRef.current = null;
    }
  }, []);

  // Initialize the map
  // MapLibre setup touches the imperative map instance in one mount effect.
  // react-doctor-disable-next-line
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const initialStyle =
      resolvedTheme === "dark" ? mapStyles.dark : mapStyles.light;
    currentStyleRef.current = initialStyle;

    const map = new MapLibreGL.Map({
      container: containerRef.current,
      style: initialStyle,
      renderWorldCopies: false,
      attributionControl: {
        compact: true,
      },
      ...props,
      ...viewport,
    });

    const styleDataHandler = () => {
      clearStyleTimeout();
      // Delay to ensure style is fully processed before allowing layer operations
      // This is a workaround to avoid race conditions with the style loading
      // else we have to force update every layer on setStyle change
      styleTimeoutRef.current = setTimeout(() => {
        setIsStyleLoaded(true);
        if (projection) {
          map.setProjection(projection);
        }
      }, 100);
    };
    const loadHandler = () => setIsLoaded(true);

    // Viewport change handler - skip if triggered by internal update
    const handleMove = () => {
      if (internalUpdateRef.current) {
        return;
      }
      onViewportChangeRef.current?.(getViewport(map));
    };

    map.on("load", loadHandler);
    map.on("styledata", styleDataHandler);
    map.on("move", handleMove);
    setMapInstance(map);

    return () => {
      clearStyleTimeout();
      map.off("load", loadHandler);
      map.off("styledata", styleDataHandler);
      map.off("move", handleMove);
      map.remove();
      setIsLoaded(false);
      setIsStyleLoaded(false);
      setMapInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync controlled viewport to map
  useEffect(() => {
    if (!mapInstance || !isControlled || !viewport) {
      return;
    }
    if (mapInstance.isMoving()) {
      return;
    }

    const current = getViewport(mapInstance);
    const next = {
      center: viewport.center ?? current.center,
      zoom: viewport.zoom ?? current.zoom,
      bearing: viewport.bearing ?? current.bearing,
      pitch: viewport.pitch ?? current.pitch,
    };

    if (
      next.center[0] === current.center[0] &&
      next.center[1] === current.center[1] &&
      next.zoom === current.zoom &&
      next.bearing === current.bearing &&
      next.pitch === current.pitch
    ) {
      return;
    }

    internalUpdateRef.current = true;
    mapInstance.jumpTo(next);
    internalUpdateRef.current = false;
  }, [mapInstance, isControlled, viewport]);

  // Handle style change
  useEffect(() => {
    if (!mapInstance || !resolvedTheme) {
      return;
    }

    const newStyle =
      resolvedTheme === "dark" ? mapStyles.dark : mapStyles.light;

    if (currentStyleRef.current === newStyle) {
      return;
    }

    clearStyleTimeout();
    currentStyleRef.current = newStyle;
    setIsStyleLoaded(false);

    mapInstance.setStyle(newStyle, { diff: true });
  }, [mapInstance, resolvedTheme, mapStyles, clearStyleTimeout]);

  const contextValue = useMemo(
    () => ({
      map: mapInstance,
      isLoaded: isLoaded && isStyleLoaded,
    }),
    [mapInstance, isLoaded, isStyleLoaded]
  );

  return (
    <MapContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        aria-label="Interactive map"
        className={cn("relative h-full w-full", className)}
        role="region"
      >
        {(!isLoaded || loading) && <DefaultLoader />}
        {/* SSR-safe: children render only when map is loaded on client */}
        {mapInstance && children}
      </div>
    </MapContext.Provider>
  );
}

interface MarkerContextValue {
  marker: MapLibreGL.Marker;
  map: MapLibreGL.Map | null;
}

const MarkerContext = createContext<MarkerContextValue | null>(null);

function useMarkerContext() {
  const context = use(MarkerContext);
  if (!context) {
    throw new Error("Marker components must be used within MapMarker");
  }
  return context;
}

type MapMarkerProps = {
  /** Longitude coordinate for marker position */
  longitude: number;
  /** Latitude coordinate for marker position */
  latitude: number;
  /** Marker subcomponents (MarkerContent, MarkerPopup, MarkerLabel) */
  children: ReactNode;
  /** Callback when marker is clicked */
  onClick?: (e: MouseEvent) => void;
  /** Callback when mouse enters marker */
  onMouseEnter?: (e: MouseEvent) => void;
  /** Callback when mouse leaves marker */
  onMouseLeave?: (e: MouseEvent) => void;
  /** Callback when marker drag starts (requires draggable: true) */
  onDragStart?: (lngLat: { lng: number; lat: number }) => void;
  /** Callback during marker drag (requires draggable: true) */
  onDrag?: (lngLat: { lng: number; lat: number }) => void;
  /** Callback when marker drag ends (requires draggable: true) */
  onDragEnd?: (lngLat: { lng: number; lat: number }) => void;
} & Omit<MarkerOptions, "element">;

function MapMarker({
  longitude,
  latitude,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDrag,
  onDragEnd,
  draggable = false,
  ...markerOptions
}: MapMarkerProps) {
  const { map } = useMap();

  const callbacksRef = useRef({
    onClick,
    onMouseEnter,
    onMouseLeave,
    onDragStart,
    onDrag,
    onDragEnd,
  });
  callbacksRef.current = {
    onClick,
    onMouseEnter,
    onMouseLeave,
    onDragStart,
    onDrag,
    onDragEnd,
  };

  const marker = useMemo(() => {
    const markerInstance = new MapLibreGL.Marker({
      ...markerOptions,
      element: document.createElement("div"),
      draggable,
    }).setLngLat([longitude, latitude]);

    const handleClick = (e: MouseEvent) => callbacksRef.current.onClick?.(e);
    const handleMouseEnter = (e: MouseEvent) =>
      callbacksRef.current.onMouseEnter?.(e);
    const handleMouseLeave = (e: MouseEvent) =>
      callbacksRef.current.onMouseLeave?.(e);

    markerInstance.getElement()?.addEventListener("click", handleClick);
    markerInstance
      .getElement()
      ?.addEventListener("mouseenter", handleMouseEnter);
    markerInstance
      .getElement()
      ?.addEventListener("mouseleave", handleMouseLeave);

    const handleDragStart = () => {
      const lngLat = markerInstance.getLngLat();
      callbacksRef.current.onDragStart?.({ lng: lngLat.lng, lat: lngLat.lat });
    };
    const handleDrag = () => {
      const lngLat = markerInstance.getLngLat();
      callbacksRef.current.onDrag?.({ lng: lngLat.lng, lat: lngLat.lat });
    };
    const handleDragEnd = () => {
      const lngLat = markerInstance.getLngLat();
      callbacksRef.current.onDragEnd?.({ lng: lngLat.lng, lat: lngLat.lat });
    };

    markerInstance.on("dragstart", handleDragStart);
    markerInstance.on("drag", handleDrag);
    markerInstance.on("dragend", handleDragEnd);

    return markerInstance;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) {
      return;
    }

    marker.addTo(map);

    return () => {
      marker.remove();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  if (
    marker.getLngLat().lng !== longitude ||
    marker.getLngLat().lat !== latitude
  ) {
    marker.setLngLat([longitude, latitude]);
  }
  if (marker.isDraggable() !== draggable) {
    marker.setDraggable(draggable);
  }

  const currentOffset = marker.getOffset();
  const newOffset = markerOptions.offset ?? [0, 0];
  const [newOffsetX, newOffsetY] = Array.isArray(newOffset)
    ? newOffset
    : [newOffset.x, newOffset.y];
  if (currentOffset.x !== newOffsetX || currentOffset.y !== newOffsetY) {
    marker.setOffset(newOffset);
  }

  if (marker.getRotation() !== markerOptions.rotation) {
    marker.setRotation(markerOptions.rotation ?? 0);
  }
  if (marker.getRotationAlignment() !== markerOptions.rotationAlignment) {
    marker.setRotationAlignment(markerOptions.rotationAlignment ?? "auto");
  }
  if (marker.getPitchAlignment() !== markerOptions.pitchAlignment) {
    marker.setPitchAlignment(markerOptions.pitchAlignment ?? "auto");
  }

  return (
    <MarkerContext.Provider value={{ marker, map }}>
      {children}
    </MarkerContext.Provider>
  );
}

interface MarkerContentProps {
  /** Custom marker content. Defaults to a blue dot if not provided */
  children?: ReactNode;
  /** Additional CSS classes for the marker container */
  className?: string;
  /** Make the marker keyboard focusable and clickable like a button */
  interactive?: boolean;
  /** Accessible label for interactive marker content */
  ariaLabel?: string;
}

function MarkerContent({
  children,
  className,
  interactive = false,
  ariaLabel,
}: MarkerContentProps) {
  const { marker } = useMarkerContext();
  const isPopupAttached = marker.getPopup() !== null;

  return createPortal(
    interactive ? (
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup={isPopupAttached ? "dialog" : undefined}
        className={cn(
          "group/map-marker relative cursor-pointer rounded-full",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
          className
        )}
      >
        {children || <DefaultMarkerIcon />}
      </button>
    ) : (
      <div
        className={cn("group/map-marker relative cursor-pointer", className)}
      >
        {children || <DefaultMarkerIcon />}
      </div>
    ),
    marker.getElement()
  );
}

function DefaultMarkerIcon() {
  return (
    <div className="relative size-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
  );
}

function PopupCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close popup"
      className="absolute top-0.5 right-0.5 z-10 inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="size-3.5" />
    </button>
  );
}

type MarkerPopupProps = {
  /** Popup content */
  children: ReactNode;
  /** Additional CSS classes for the popup container */
  className?: string;
  /** Show a close button in the popup (default: false) */
  closeButton?: boolean;
} & Omit<PopupOptions, "className" | "closeButton">;

function MarkerPopup({
  children,
  className,
  closeButton = false,
  ...popupOptions
}: MarkerPopupProps) {
  const { marker, map } = useMarkerContext();
  const container = useMemo(() => document.createElement("div"), []);
  const prevPopupOptions = useRef(popupOptions);

  const popup = useMemo(() => {
    const popupInstance = new MapLibreGL.Popup({
      offset: 16,
      ...popupOptions,
      closeButton: false,
    })
      .setMaxWidth("none")
      .setDOMContent(container);

    return popupInstance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) {
      return;
    }

    popup.setDOMContent(container);
    marker.setPopup(popup);

    return () => {
      marker.setPopup(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  if (popup.isOpen()) {
    const prev = prevPopupOptions.current;

    if (prev.offset !== popupOptions.offset) {
      popup.setOffset(popupOptions.offset ?? 16);
    }
    if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
      popup.setMaxWidth(popupOptions.maxWidth ?? "none");
    }

    prevPopupOptions.current = popupOptions;
  }

  const handleClose = () => popup.remove();

  return createPortal(
    <div
      className={cn(
        "relative max-w-62 rounded-md border bg-popover p-3 text-popover-foreground shadow-md",
        "animate-in duration-200 ease-out fade-in-0 zoom-in-95",
        className
      )}
    >
      {closeButton && <PopupCloseButton onClick={handleClose} />}
      {children}
    </div>,
    container
  );
}

interface MarkerLabelProps {
  /** Label text content */
  children: ReactNode;
  /** Additional CSS classes for the label */
  className?: string;
  /** Position of the label relative to the marker (default: "top") */
  position?: "top" | "bottom";
  /** Visibility mode for the label */
  visibility?: "always" | "hover";
}

function MarkerLabel({
  children,
  className,
  position = "top",
  visibility = "always",
}: MarkerLabelProps) {
  const positionClasses = {
    top: "bottom-full mb-1",
    bottom: "top-full mt-1",
  };

  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 whitespace-nowrap",
        "text-[10px] font-medium text-foreground",
        visibility === "hover"
          ? "opacity-0 transition-opacity duration-150 group-focus-within/map-marker:opacity-100 group-hover/map-marker:opacity-100"
          : null,
        positionClasses[position],
        className
      )}
    >
      {children}
    </div>
  );
}

type MapControl = "zoom" | "compass" | "locate" | "fullscreen";

interface MapControlsProps {
  /** Position of the controls on the map (default: "bottom-right") */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Controls to render. Defaults to zoom controls only. */
  controls?: readonly MapControl[];
  /** Additional CSS classes for the controls container */
  className?: string;
  /** Callback with user coordinates when located */
  onLocate?: (coords: { longitude: number; latitude: number }) => void;
  /** Callback when browser geolocation fails */
  onLocateError?: (error: BrowserGeolocationError) => void;
}

const positionClasses = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-10 right-2",
};

const DEFAULT_MAP_CONTROLS = ["zoom"] as const satisfies readonly MapControl[];

function ControlGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-background shadow-sm [&>button:not(:last-child)]:border-b [&>button:not(:last-child)]:border-border">
      {children}
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  shortcut,
  children,
  busy = false,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  shortcut?: string;
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
}) {
  const button = (
    <button
      onClick={onClick}
      aria-label={label}
      aria-busy={busy || undefined}
      type="button"
      className={cn(
        "flex size-8 items-center justify-center transition-all",
        "first:rounded-t-md last:rounded-b-md",
        "hover:bg-accent dark:hover:bg-accent/40",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        "disabled:pointer-events-none disabled:opacity-50"
      )}
      disabled={disabled}
    >
      {children}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>
        <span>{label}</span>
        {shortcut ? <ShortcutHint hotkey={shortcut} label={label} /> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function MapControls({
  position = "bottom-right",
  controls = DEFAULT_MAP_CONTROLS,
  className,
  onLocate,
  onLocateError,
}: MapControlsProps) {
  const { map } = useMap();
  const [waitingForLocation, setWaitingForLocation] = useState(false);
  const showZoom = controls.includes("zoom");
  const showCompass = controls.includes("compass");
  const showLocate = controls.includes("locate");
  const showFullscreen = controls.includes("fullscreen");
  const mapHotkeyTarget = map?.getCanvas() ?? null;

  const handleZoomIn = useCallback(() => {
    map?.zoomTo(map.getZoom() + 1, { duration: 300 });
  }, [map]);

  const handleZoomOut = useCallback(() => {
    map?.zoomTo(map.getZoom() - 1, { duration: 300 });
  }, [map]);

  const handleResetBearing = useCallback(() => {
    map?.resetNorthPitch({ duration: 300 });
  }, [map]);

  const handleLocate = useCallback(() => {
    if (waitingForLocation) {
      return;
    }

    setWaitingForLocation(true);

    void (async () => {
      const exit = await Effect.runPromiseExit(requestBrowserGeolocation());

      if (Exit.isSuccess(exit)) {
        const coords = {
          latitude: exit.value.latitude,
          longitude: exit.value.longitude,
        };

        map?.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 14,
          duration: 1500,
        });
        onLocate?.(coords);
      } else {
        const failure = Cause.failureOption(exit.cause);

        if (Option.isSome(failure)) {
          onLocateError?.(failure.value);
        }
      }

      setWaitingForLocation(false);
    })();
  }, [map, onLocate, onLocateError, waitingForLocation]);

  const handleFullscreen = useCallback(() => {
    const container = map?.getContainer();
    if (!container) {
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, [map]);

  useAppHotkey("mapZoomIn", handleZoomIn, {
    enabled: showZoom && map !== null,
    target: mapHotkeyTarget,
  });
  useAppHotkey("mapZoomOut", handleZoomOut, {
    enabled: showZoom && map !== null,
    target: mapHotkeyTarget,
  });
  useAppHotkey("mapResetBearing", handleResetBearing, {
    enabled: showCompass && map !== null,
    target: mapHotkeyTarget,
  });
  useAppHotkey("mapLocate", handleLocate, {
    enabled: showLocate && map !== null && !waitingForLocation,
    target: mapHotkeyTarget,
  });
  useAppHotkey("mapFullscreen", handleFullscreen, {
    enabled: showFullscreen && map !== null,
    target: mapHotkeyTarget,
  });

  return (
    <div
      className={cn(
        "absolute z-10 flex flex-col gap-1.5",
        positionClasses[position],
        className
      )}
    >
      {showZoom && (
        <ControlGroup>
          <ControlButton
            onClick={handleZoomIn}
            label="Zoom in"
            shortcut={HOTKEYS.mapZoomIn.hotkey}
          >
            <Plus className="size-4" />
          </ControlButton>
          <ControlButton
            onClick={handleZoomOut}
            label="Zoom out"
            shortcut={HOTKEYS.mapZoomOut.hotkey}
          >
            <Minus className="size-4" />
          </ControlButton>
        </ControlGroup>
      )}
      {showCompass && (
        <ControlGroup>
          <CompassButton onClick={handleResetBearing} />
        </ControlGroup>
      )}
      {showLocate && (
        <ControlGroup>
          <ControlButton
            onClick={handleLocate}
            label="Find my location"
            shortcut={HOTKEYS.mapLocate.hotkey}
            busy={waitingForLocation}
            disabled={waitingForLocation}
          >
            {waitingForLocation ? (
              <DotMatrixButtonLoader />
            ) : (
              <Locate className="size-4" />
            )}
          </ControlButton>
        </ControlGroup>
      )}
      {showFullscreen && (
        <ControlGroup>
          <ControlButton
            onClick={handleFullscreen}
            label="Toggle fullscreen"
            shortcut={HOTKEYS.mapFullscreen.hotkey}
          >
            <Maximize className="size-4" />
          </ControlButton>
        </ControlGroup>
      )}
    </div>
  );
}

function CompassButton({ onClick }: { onClick: () => void }) {
  const { map } = useMap();
  const compassRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!map || !compassRef.current) {
      return;
    }

    const compass = compassRef.current;

    const updateRotation = () => {
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      compass.style.transform = `rotateX(${pitch}deg) rotateZ(${-bearing}deg)`;
    };

    map.on("rotate", updateRotation);
    map.on("pitch", updateRotation);
    updateRotation();

    return () => {
      map.off("rotate", updateRotation);
      map.off("pitch", updateRotation);
    };
  }, [map]);

  return (
    <ControlButton
      onClick={onClick}
      label="Reset bearing to north"
      shortcut={HOTKEYS.mapResetBearing.hotkey}
    >
      <svg
        ref={compassRef}
        viewBox="0 0 24 24"
        className="size-5 transition-transform duration-200"
        style={{ transformStyle: "preserve-3d" }}
      >
        <path d="M12 2L16 12H12V2Z" className="fill-red-500" />
        <path d="M12 2L8 12H12V2Z" className="fill-red-300" />
        <path d="M12 22L16 12H12V22Z" className="fill-muted-foreground/60" />
        <path d="M12 22L8 12H12V22Z" className="fill-muted-foreground/30" />
      </svg>
    </ControlButton>
  );
}

export {
  Map,
  useMap,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MarkerLabel,
  MapControls,
};

export type { MapRef };
