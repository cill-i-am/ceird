import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocationAccessOnboardingPage } from "./location-access-onboarding-page";

const { mockedNavigate, mockedUpdateCurrentUserPreferences } = vi.hoisted(
  () => ({
    mockedNavigate: vi.fn<(options: { readonly to: "/" }) => Promise<void>>(),
    mockedUpdateCurrentUserPreferences: vi.fn<
      (input: { readonly routeProximityLocationEnabled: boolean }) => Promise<{
        preferences: {
          routeProximityLocationEnabled: boolean;
          updatedAt: string;
        };
      }>
    >(),
  })
);

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: (() => mockedNavigate) as unknown as typeof actual.useNavigate,
  };
});

vi.mock(import("#/features/settings/user-preferences-api"), () => ({
  DEFAULT_USER_PREFERENCES: {
    routeProximityLocationEnabled: false,
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  updateCurrentUserPreferences: mockedUpdateCurrentUserPreferences,
}));

describe("location access onboarding page", () => {
  beforeEach(() => {
    window.history.replaceState(
      {},
      "",
      "http://localhost:3000/location-access"
    );
    mockedNavigate.mockResolvedValue();
    mockedUpdateCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a skippable first-run location access screen", async () => {
    const user = userEvent.setup();

    render(<LocationAccessOnboardingPage />);

    expect(
      screen.getByRole("heading", { name: "Location access" })
    ).toBeVisible();
    expect(
      screen.getByText(/traffic-aware nearby jobs and sites/i)
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(mockedNavigate).toHaveBeenCalledWith({ to: "/" });
    expect(mockedUpdateCurrentUserPreferences).not.toHaveBeenCalled();
  }, 10_000);

  it("starts from the saved route proximity preference when it is already enabled", () => {
    render(
      <LocationAccessOnboardingPage
        initialPreferences={{
          routeProximityLocationEnabled: true,
          updatedAt: "2026-06-06T10:00:00.000Z",
        }}
        preferencesUnavailable={false}
      />
    );

    expect(screen.getByText("Enabled")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue to Ceird" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Skip for now" })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("shows an unavailable preference state when the route loader cannot load it", () => {
    render(
      <LocationAccessOnboardingPage
        initialPreferences={{
          routeProximityLocationEnabled: false,
          updatedAt: "1970-01-01T00:00:00.000Z",
        }}
        preferencesUnavailable
      />
    );

    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Enable location access" })
    ).toBeDisabled();
  }, 10_000);

  it("requests browser location before enabling access during onboarding", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
      (success) => {
        success({
          coords: {
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude: 53.3498,
            longitude: -6.2603,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        });
      }
    );

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<LocationAccessOnboardingPage />);

    await user.click(
      screen.getByRole("button", { name: "Enable location access" })
    );

    await waitFor(() => {
      expect(mockedUpdateCurrentUserPreferences).toHaveBeenCalledWith({
        routeProximityLocationEnabled: true,
      });
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(screen.getByText("Enabled")).toBeVisible();
    expect(screen.getByText(/Location permission granted/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue to Ceird" }));

    expect(mockedNavigate).toHaveBeenCalledWith({ to: "/" });
  }, 10_000);

  it("does not save the location preference when browser permission is denied", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
      (_success, error) => {
        error?.({
          code: 1,
          message: "User denied Geolocation",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      }
    );

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<LocationAccessOnboardingPage />);

    await user.click(
      screen.getByRole("button", { name: "Enable location access" })
    );

    await expect(
      screen.findByText("Location permission was denied.")
    ).resolves.toBeVisible();
    expect(mockedUpdateCurrentUserPreferences).not.toHaveBeenCalled();
    expect(screen.getByText("Disabled")).toBeVisible();
  }, 10_000);

  it("keeps onboarding navigation disabled while saving the preference", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
      (success) => {
        success({
          coords: {
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude: 53.3498,
            longitude: -6.2603,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        });
      }
    );
    const preferenceUpdate = Promise.withResolvers<{
      preferences: {
        routeProximityLocationEnabled: boolean;
        updatedAt: string;
      };
    }>();
    mockedUpdateCurrentUserPreferences.mockReturnValueOnce(
      preferenceUpdate.promise
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<LocationAccessOnboardingPage />);

    await user.click(
      screen.getByRole("button", { name: "Enable location access" })
    );

    expect(screen.getByRole("button", { name: "Skip for now" })).toBeDisabled();
    preferenceUpdate.resolve({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:01:00.000Z",
      },
    });

    await expect(screen.findByText("Enabled")).resolves.toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue to Ceird" })
    ).not.toBeDisabled();
  }, 10_000);
});
