import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { SiteLocationMapPreviewCanvas } from "./site-location-map-preview-canvas";

vi.mock(import("#/components/ui/map"), () => ({
  Map: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  MapControls: () => <div data-testid="map-controls" />,
  MapMarker: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid="map-marker">{children}</div>
  ),
  MarkerContent: ({ children }: { readonly children?: ReactNode }) =>
    createPortal(
      <div data-testid="marker-content">{children}</div>,
      document.body
    ),
  MarkerLabel: ({ children }: { readonly children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

describe("site location map preview canvas", () => {
  it("renders the map preview without redundant helper copy", () => {
    render(
      <SiteLocationMapPreviewCanvas
        site={{
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Docklands Campus",
        }}
      />
    );

    expect(screen.getByText("Map preview")).toBeInTheDocument();
    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(screen.getByText("Docklands Campus")).toBeInTheDocument();
    expect(
      screen.queryByText("A quick visual check before you open navigation.")
    ).not.toBeInTheDocument();
  });

  it("renders a coordinate-required state when the site is unmapped", () => {
    render(
      <SiteLocationMapPreviewCanvas
        site={{
          name: "Docklands Campus",
        }}
      />
    );

    expect(
      screen.getByText(
        "The preview needs site coordinates before it can render a map."
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });
});
