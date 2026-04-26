import type * as HugeiconsReact from "@hugeicons/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import type * as MapModule from "#/components/ui/map";
import { BrowserGeolocationPermissionDeniedError } from "#/lib/browser-geolocation";

import { JobsSitePinPickerCanvas } from "./jobs-site-pin-picker-canvas";

const locateCoordinates = {
  latitude: 53.3498,
  longitude: -6.2603,
};
const mockedLocateError = vi.fn<() => boolean>();

vi.mock(
  import("@hugeicons/react"),
  () =>
    ({
      HugeiconsIcon: () => <span data-testid="hugeicon" />,
    }) as unknown as typeof HugeiconsReact
);

vi.mock(
  import("#/components/ui/map"),
  () =>
    ({
      Map: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      MapControls: ({
        onLocate,
        onLocateError,
      }: {
        onLocate?: (coords: typeof locateCoordinates) => void;
        onLocateError?: (
          error: BrowserGeolocationPermissionDeniedError
        ) => void;
      }) => (
        <button
          type="button"
          onClick={() => {
            if (mockedLocateError()) {
              onLocateError?.(
                new BrowserGeolocationPermissionDeniedError({
                  message: "Location permission was denied.",
                })
              );
              return;
            }

            onLocate?.(locateCoordinates);
          }}
        >
          Find my location
        </button>
      ),
      MapMarker: ({ children }: { children?: ReactNode }) => (
        <div>{children}</div>
      ),
      MarkerContent: ({ children }: { children?: ReactNode }) => (
        <div>{children}</div>
      ),
      MarkerLabel: ({ children }: { children?: ReactNode }) => (
        <div>{children}</div>
      ),
      useMap: () => ({ isLoaded: false, map: null }),
    }) as unknown as typeof MapModule
);

describe("jobs site pin picker canvas", () => {
  beforeEach(() => {
    mockedLocateError.mockReset();
    mockedLocateError.mockReturnValue(false);
  });

  it("pins the site to the browser location from map controls", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(next: typeof locateCoordinates) => void>();

    render(<JobsSitePinPickerCanvas onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Find my location" }));

    expect(onChange).toHaveBeenCalledWith(locateCoordinates);
  }, 10_000);

  it("shows a geolocation failure without changing the pin", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(next: typeof locateCoordinates) => void>();
    mockedLocateError.mockReturnValue(true);

    render(<JobsSitePinPickerCanvas onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Find my location" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Location permission was denied."
    );
    expect(onChange).not.toHaveBeenCalled();
  }, 10_000);
});
