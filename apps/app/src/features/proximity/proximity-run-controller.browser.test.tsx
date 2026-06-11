import type {
  CurrentLocationOrigin,
  GooglePlaceIdType,
  GooglePlacesSessionTokenType,
  ProximityOriginAutocompleteInput,
  ProximityOriginAutocompleteResponse,
  ProximityOriginInput,
  ProximityOriginPlaceDetailsInput,
  ProximityOriginPlaceDetailsResponse,
  ProximityOriginSuggestion,
  TypedOrigin,
} from "@ceird/proximity-core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Effect } from "effect";
import * as React from "react";

import { useProximityRunController } from "./proximity-run-controller";

interface TestInput {
  readonly includeRouteLines: boolean;
  readonly limit: 10;
  readonly origin: ProximityOriginInput;
}

interface TestResponse {
  readonly rows: readonly { readonly id: string }[];
}

const dublinPortPlaceId = "ChIJN1t_tDeuEmsRUsoyG83frY4" as GooglePlaceIdType;

const suggestion: ProximityOriginSuggestion = {
  displayText: "Dublin Port",
  placeId: dublinPortPlaceId,
  secondaryText: "Dublin, Ireland",
};

const currentLocationOrigin: CurrentLocationOrigin = {
  accuracyMeters: 16,
  coordinates: {
    latitude: 53.349_805,
    longitude: -6.260_31,
  },
  mode: "current_location",
};

const typedOrigin: TypedOrigin = {
  coordinates: {
    latitude: 53.3478,
    longitude: -6.1956,
  },
  displayText: "Dublin Port, Dublin, Ireland",
  mode: "typed_origin",
  originToken: "v1.typedOrigin.testSignature" as TypedOrigin["originToken"],
  placeId: dublinPortPlaceId,
};

const defaultAutocompleteOrigin = () =>
  Effect.succeed({ suggestions: [suggestion] });
const defaultRank = () => Effect.succeed({ rows: [{ id: "first" }] });
const defaultRequestCurrentOrigin = () => Effect.succeed(currentLocationOrigin);
const defaultResolveOriginPlace = () => Effect.succeed({ origin: typedOrigin });

describe(useProximityRunController, () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not rank before an origin is resolved", () => {
    const rank = vi.fn<
      (input: TestInput) => Effect.Effect<TestResponse, unknown>
    >(() => Effect.succeed({ rows: [{ id: "first" }] }));

    render(<ControllerHarness initialActive rank={rank} />);

    expect(screen.getByTestId("origin-status")).toHaveTextContent("idle");
    expect(screen.getByTestId("request-status")).toHaveTextContent("idle");
    expect(rank).not.toHaveBeenCalled();
  });

  it("opens typed-origin fallback without ranking when current location access is disabled", async () => {
    const rank = vi.fn<
      (input: TestInput) => Effect.Effect<TestResponse, unknown>
    >(() => Effect.succeed({ rows: [{ id: "first" }] }));

    render(
      <ControllerHarness rank={rank} routeProximityLocationEnabled={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable near me" }));

    await expect(screen.findByTestId("active")).resolves.toHaveTextContent(
      "true"
    );
    expect(screen.getByTestId("origin-status")).toHaveTextContent(
      "needs_origin"
    );
    expect(screen.getByTestId("dialog-open")).toHaveTextContent("true");
    expect(rank).not.toHaveBeenCalled();
  });

  it("ignores stale typed-origin details after proximity is disabled", async () => {
    const rank = vi.fn<
      (input: TestInput) => Effect.Effect<TestResponse, unknown>
    >(() => Effect.succeed({ rows: [{ id: "first" }] }));
    const placeDetails = makePending<ProximityOriginPlaceDetailsResponse>();

    render(
      <ControllerHarness
        initialActive
        rank={rank}
        resolveOriginPlace={() => placeDetails.effect}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open origin" }));
    fireEvent.change(screen.getByLabelText("origin query"), {
      target: { value: "Dublin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select suggestion" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm origin" }));
    expect(screen.getByTestId("dialog-loading")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Disable near me" }));

    await act(async () => {
      placeDetails.resolve({ origin: typedOrigin });
      await Promise.resolve();
    });

    expect(screen.getByTestId("origin-status")).toHaveTextContent("idle");
    expect(screen.getByTestId("request-status")).toHaveTextContent("idle");
    expect(rank).not.toHaveBeenCalled();
  });

  it("resets typed-origin session tokens when origin search is cleared or closed", async () => {
    const sessionTokens: readonly GooglePlacesSessionTokenType[] = [
      "token1" as GooglePlacesSessionTokenType,
      "token2" as GooglePlacesSessionTokenType,
      "token3" as GooglePlacesSessionTokenType,
    ];
    let sessionTokenIndex = 0;
    const createSessionToken = vi.fn<() => GooglePlacesSessionTokenType>(() => {
      const token = sessionTokens[sessionTokenIndex];
      sessionTokenIndex += 1;

      if (token === undefined) {
        throw new Error("unexpected session token request");
      }

      return token;
    });
    const autocompleteOrigin = vi.fn<
      (
        input: ProximityOriginAutocompleteInput
      ) => Effect.Effect<ProximityOriginAutocompleteResponse, unknown>
    >(() => Effect.succeed({ suggestions: [suggestion] }));

    render(
      <ControllerHarness
        initialActive
        autocompleteOrigin={autocompleteOrigin}
        autocompleteDebounceMs={0}
        createSessionToken={createSessionToken}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open origin" }));
    fireEvent.change(screen.getByLabelText("origin query"), {
      target: { value: "Dublin" },
    });
    await waitFor(() => expect(autocompleteOrigin).toHaveBeenCalledOnce());
    expect(autocompleteOrigin).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionToken: "token1" })
    );

    fireEvent.change(screen.getByLabelText("origin query"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("origin query"), {
      target: { value: "Cork" },
    });
    await waitFor(() => expect(autocompleteOrigin).toHaveBeenCalledTimes(2));
    expect(autocompleteOrigin).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionToken: "token2" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Close origin" }));
    fireEvent.click(screen.getByRole("button", { name: "Open origin" }));
    fireEvent.change(screen.getByLabelText("origin query"), {
      target: { value: "Galway" },
    });
    await waitFor(() => expect(autocompleteOrigin).toHaveBeenCalledTimes(3));
    expect(autocompleteOrigin).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionToken: "token3" })
    );
  });

  it("does not repeat route ranking for an unchanged resolved origin and input", async () => {
    const rank = vi.fn<
      (input: TestInput) => Effect.Effect<TestResponse, unknown>
    >(() => Effect.succeed({ rows: [{ id: "first" }] }));

    render(<ControllerHarness rank={rank} rankingDebounceMs={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Enable near me" }));

    await waitFor(() => expect(rank).toHaveBeenCalledOnce());
    await expect(
      screen.findByTestId("request-status")
    ).resolves.toHaveTextContent("success");

    await act(async () => {
      await Promise.resolve();
    });

    expect(rank).toHaveBeenCalledOnce();
  });
});

function ControllerHarness({
  autocompleteOrigin = defaultAutocompleteOrigin,
  autocompleteDebounceMs,
  createSessionToken,
  initialActive = false,
  rank = defaultRank,
  rankingDebounceMs,
  requestCurrentOrigin = defaultRequestCurrentOrigin,
  resolveOriginPlace = defaultResolveOriginPlace,
  routeProximityLocationEnabled = true,
}: {
  readonly autocompleteOrigin?: (
    input: ProximityOriginAutocompleteInput
  ) => Effect.Effect<ProximityOriginAutocompleteResponse, unknown>;
  readonly autocompleteDebounceMs?: number;
  readonly createSessionToken?: () => GooglePlacesSessionTokenType;
  readonly initialActive?: boolean;
  readonly rank?: (input: TestInput) => Effect.Effect<TestResponse, unknown>;
  readonly rankingDebounceMs?: number;
  readonly requestCurrentOrigin?: () => Effect.Effect<
    CurrentLocationOrigin,
    unknown
  >;
  readonly resolveOriginPlace?: (
    input: ProximityOriginPlaceDetailsInput
  ) => Effect.Effect<ProximityOriginPlaceDetailsResponse, unknown>;
  readonly routeProximityLocationEnabled?: boolean;
}) {
  const [active, setActive] = React.useReducer(
    (_currentActive: boolean, nextActive: boolean) => nextActive,
    initialActive
  );
  const buildInput = React.useCallback(
    ({
      includeRouteLines,
      origin,
    }: {
      readonly includeRouteLines: boolean;
      readonly origin: ProximityOriginInput;
    }) => ({
      includeRouteLines,
      limit: 10 as const,
      origin,
    }),
    []
  );
  const getFailureMessage = React.useCallback(
    () => "Could not rank routes",
    []
  );
  const getFirstSelectionId = React.useCallback(
    (response: TestResponse) => response.rows[0]?.id ?? null,
    []
  );
  const isInputEligible = React.useCallback(() => true, []);
  const makeInputKey = React.useCallback(
    (input: TestInput) => JSON.stringify(input),
    []
  );
  const services = React.useMemo(
    () => ({
      autocompleteOrigin,
      createSessionToken,
      requestCurrentOrigin,
      resolveOriginPlace,
    }),
    [
      autocompleteOrigin,
      createSessionToken,
      requestCurrentOrigin,
      resolveOriginPlace,
    ]
  );
  const controller = useProximityRunController<TestInput, TestResponse, string>(
    {
      active,
      autocompleteDebounceMs,
      buildInput,
      currentLocationRequestKey: 0,
      getFailureMessage,
      getFirstSelectionId,
      includeRouteLines: false,
      isInputEligible,
      makeInputKey,
      rank,
      rankingDebounceMs,
      routeProximityLocationEnabled,
      services,
      onActiveChange: setActive,
    }
  );

  const selectedSuggestion = controller.selectedSuggestion ?? suggestion;

  return (
    <div>
      <div data-testid="active">{String(active)}</div>
      <div data-testid="origin-status">{controller.origin.status}</div>
      <div data-testid="request-status">{controller.request.status}</div>
      <div data-testid="dialog-open">{String(controller.originDialogOpen)}</div>
      <div data-testid="dialog-loading">
        {String(controller.originDialogLoading)}
      </div>
      <label>
        origin query
        <input
          aria-label="origin query"
          value={controller.originQuery}
          onChange={(event) =>
            controller.handleOriginQueryChange(event.currentTarget.value)
          }
        />
      </label>
      <button type="button" onClick={controller.enableNearMe}>
        Enable near me
      </button>
      <button type="button" onClick={controller.disableNearMe}>
        Disable near me
      </button>
      <button
        type="button"
        onClick={() => controller.handleOriginDialogOpen(true)}
      >
        Open origin
      </button>
      <button
        type="button"
        onClick={() => controller.handleOriginDialogOpen(false)}
      >
        Close origin
      </button>
      <button
        type="button"
        onClick={() => controller.handleSuggestionSelect(suggestion)}
      >
        Select suggestion
      </button>
      <button
        type="button"
        onClick={() => controller.confirmTypedOrigin(selectedSuggestion)}
      >
        Confirm origin
      </button>
    </div>
  );
}

function makePending<T>() {
  const { promise, resolve } = Promise.withResolvers<T>();

  return {
    effect: Effect.promise(() => promise),
    resolve,
  };
}
