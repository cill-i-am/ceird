import type {
  RateCard,
  RateCardIdType,
  RateCardLineIdType,
} from "@ceird/jobs-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { RegistryProvider } from "@effect-atom/atom-react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import type * as EffectPackage from "effect";

import { OrganizationRateCardSection } from "./organization-rate-card-section";

type EffectClientMock = (...args: unknown[]) => unknown;

const standardRateCardId =
  "22222222-2222-4222-8222-222222222222" as RateCardIdType;
const alternateRateCardId =
  "33333333-3333-4333-8333-333333333333" as RateCardIdType;
const lineId = "44444444-4444-4444-8444-444444444444" as RateCardLineIdType;
const secondLineId =
  "55555555-5555-4555-8555-555555555555" as RateCardLineIdType;

const {
  mockedCreateRateCard,
  mockedListRateCards,
  mockedMakeBrowserAppApiClient,
  mockedUpdateRateCard,
} = vi.hoisted(() => ({
  mockedCreateRateCard: vi.fn<EffectClientMock>(),
  mockedListRateCards: vi.fn<EffectClientMock>(),
  mockedMakeBrowserAppApiClient: vi.fn<EffectClientMock>(),
  mockedUpdateRateCard: vi.fn<EffectClientMock>(),
}));

vi.mock("#/features/api/app-api-client", async () => {
  const { Effect: EffectModule } =
    await vi.importActual<typeof EffectPackage>("effect");

  return {
    makeBrowserAppApiClient: mockedMakeBrowserAppApiClient,
    provideBrowserAppApiHttp: (effect: unknown) => effect,
    runBrowserAppApiRequest: (
      _operation: string,
      execute: (client: unknown) => unknown
    ) =>
      (mockedMakeBrowserAppApiClient() as Effect.Effect<unknown, unknown>).pipe(
        EffectModule.flatMap(
          (client) => execute(client) as Effect.Effect<unknown, unknown>
        )
      ),
  };
});

vi.setConfig({ testTimeout: 10_000 });

describe("organization rate card section", () => {
  beforeEach(() => {
    mockedCreateRateCard.mockReset();
    mockedListRateCards.mockReset();
    mockedMakeBrowserAppApiClient.mockReset();
    mockedUpdateRateCard.mockReset();

    mockedListRateCards.mockReturnValue(
      Effect.succeed({
        items: [buildRateCard("Standard", standardRateCardId)],
      })
    );
    mockedCreateRateCard.mockReturnValue(
      Effect.succeed(buildRateCard("Standard", standardRateCardId))
    );
    mockedUpdateRateCard.mockReturnValue(
      Effect.succeed(buildRateCard("Standard", standardRateCardId))
    );
    mockedMakeBrowserAppApiClient.mockImplementation(() =>
      Effect.succeed({
        rateCards: {
          createRateCard: mockedCreateRateCard,
          listRateCards: mockedListRateCards,
          updateRateCard: mockedUpdateRateCard,
        },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lets admins see the rate card section", async () => {
    renderRateCardSection();

    await expect(
      screen.findByRole("heading", { name: "Rate card" })
    ).resolves.toBeVisible();
    await expect(screen.findByText("Standard")).resolves.toBeVisible();
  });

  it("creates the single Standard card on first save when none exists", async () => {
    mockedListRateCards.mockReturnValue(Effect.succeed({ items: [] }));
    const user = userEvent.setup();
    renderRateCardSection();

    await screen.findByRole("heading", { name: "Rate card" });
    await user.click(screen.getByRole("button", { name: "Save rate card" }));

    await waitFor(() => {
      expect(mockedCreateRateCard).toHaveBeenCalledWith({
        payload: {
          lines: [],
          name: "Standard",
        },
      });
    });
    expect(mockedUpdateRateCard).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Rate card")).not.toBeInTheDocument();
  });

  it("does not update an unchanged existing Standard card", async () => {
    const user = userEvent.setup();
    renderRateCardSection();

    await screen.findByText("Standard");
    await user.click(screen.getByRole("button", { name: "Save rate card" }));

    expect(mockedUpdateRateCard).not.toHaveBeenCalled();
    expect(mockedCreateRateCard).not.toHaveBeenCalled();
  });

  it("hides the draft save action until rate cards finish loading", async () => {
    const rateCardsResponse = createDeferredRateCardsResponse();
    mockedListRateCards.mockReturnValue(
      Effect.promise(() => rateCardsResponse.promise)
    );

    renderRateCardSection();

    await expect(
      screen.findByText("Loading rate card...")
    ).resolves.toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save rate card" })
    ).not.toBeInTheDocument();
    expect(mockedCreateRateCard).not.toHaveBeenCalled();

    act(() => {
      rateCardsResponse.resolve({
        items: [buildRateCard("Standard", standardRateCardId)],
      });
    });

    await expect(
      screen.findByRole("button", { name: "Save rate card" })
    ).resolves.toBeVisible();
  });

  it("edits the existing Standard card and sends the entered line payload", async () => {
    mockedListRateCards.mockReturnValue(
      Effect.succeed({
        items: [
          buildRateCard("After hours", alternateRateCardId),
          buildRateCard("Standard", standardRateCardId),
        ],
      })
    );
    const user = userEvent.setup();
    renderRateCardSection();

    await screen.findByText("Standard");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.selectOptions(
      screen.getByLabelText("Kind for line 1"),
      "labour"
    );
    await user.type(screen.getByLabelText("Name for line 1"), "labour");
    await user.clear(screen.getByLabelText("Value for line 1"));
    await user.type(screen.getByLabelText("Value for line 1"), "85");
    await user.type(screen.getByLabelText("Unit for line 1"), "hour");
    await user.click(screen.getByRole("button", { name: "Save rate card" }));

    await waitFor(() => {
      expect(mockedUpdateRateCard).toHaveBeenCalledWith({
        path: {
          rateCardId: standardRateCardId,
        },
        payload: {
          lines: [
            {
              kind: "labour",
              name: "labour",
              position: 1,
              unit: "hour",
              value: 85,
            },
          ],
          name: "Standard",
        },
      });
    });
    expect(mockedCreateRateCard).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Rate card")).not.toBeInTheDocument();
  });

  it("removes a Standard card line and renumbers the update payload", async () => {
    mockedListRateCards.mockReturnValue(
      Effect.succeed({
        items: [
          buildRateCard("Standard", standardRateCardId, [
            buildRateCardLine({
              id: lineId,
              kind: "custom",
              name: "Parking",
              position: 1,
              unit: "visit",
              value: 20,
            }),
            buildRateCardLine({
              id: secondLineId,
              kind: "labour",
              name: "Labour",
              position: 2,
              unit: "hour",
              value: 85,
            }),
          ]),
        ],
      })
    );
    const user = userEvent.setup();
    renderRateCardSection();

    await screen.findByDisplayValue("Parking");
    await user.click(screen.getByRole("button", { name: "Remove line 1" }));
    expect(screen.queryByDisplayValue("Parking")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name for line 1")).toHaveValue("Labour");
    await user.click(screen.getByRole("button", { name: "Save rate card" }));

    await waitFor(() => {
      expect(mockedUpdateRateCard).toHaveBeenCalledWith({
        path: {
          rateCardId: standardRateCardId,
        },
        payload: {
          lines: [
            {
              kind: "labour",
              name: "Labour",
              position: 1,
              unit: "hour",
              value: 85,
            },
          ],
          name: "Standard",
        },
      });
    });
    expect(mockedCreateRateCard).not.toHaveBeenCalled();
  });

  it("shows validation errors for blank line names and negative values", async () => {
    const user = userEvent.setup();
    renderRateCardSection();

    await screen.findByText("Standard");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.clear(screen.getByLabelText("Value for line 1"));
    await user.type(screen.getByLabelText("Value for line 1"), "-1");
    await user.type(screen.getByLabelText("Unit for line 1"), "hour");
    await user.click(screen.getByRole("button", { name: "Save rate card" }));

    expect(screen.getByText("Add a line name.")).toBeVisible();
    expect(screen.getByText("Use zero or a positive value.")).toBeVisible();
    expect(mockedCreateRateCard).not.toHaveBeenCalled();
    expect(mockedUpdateRateCard).not.toHaveBeenCalled();
  });

  it("shows a validation error for blank line values instead of saving zero", async () => {
    const user = userEvent.setup();
    renderRateCardSection();

    await screen.findByText("Standard");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByLabelText("Name for line 1"), "labour");
    await user.clear(screen.getByLabelText("Value for line 1"));
    await user.type(screen.getByLabelText("Unit for line 1"), "hour");
    await user.click(screen.getByRole("button", { name: "Save rate card" }));

    expect(screen.getByText("Add a value.")).toBeVisible();
    expect(mockedCreateRateCard).not.toHaveBeenCalled();
    expect(mockedUpdateRateCard).not.toHaveBeenCalled();
  });
});

function renderRateCardSection() {
  return render(
    <RegistryProvider>
      <OrganizationRateCardSection />
    </RegistryProvider>
  );
}

function createDeferredRateCardsResponse() {
  const { promise, resolve } = (
    Promise as unknown as {
      withResolvers: <Value>() => {
        promise: Promise<Value>;
        reject: (reason?: unknown) => void;
        resolve: (value: Value) => void;
      };
    }
  ).withResolvers<{ readonly items: readonly RateCard[] }>();

  return { promise, resolve };
}

function buildRateCard(
  name: string,
  id: RateCardIdType,
  lines?: RateCard["lines"]
): RateCard {
  return {
    createdAt: "2026-04-28T09:00:00.000Z",
    id,
    lines:
      lines ??
      (name === "Standard"
        ? []
        : [
            buildRateCardLine({
              id: lineId,
              kind: "custom",
              name: "Parking",
              position: 1,
              rateCardId: id,
              unit: "visit",
              value: 20,
            }),
          ]),
    name,
    updatedAt: "2026-04-28T09:00:00.000Z",
  };
}

function buildRateCardLine({
  id,
  kind,
  name,
  position,
  rateCardId = standardRateCardId,
  unit,
  value,
}: Pick<
  RateCard["lines"][number],
  "id" | "kind" | "name" | "position" | "unit" | "value"
> & {
  readonly rateCardId?: RateCardIdType;
}): RateCard["lines"][number] {
  return {
    id,
    kind,
    name,
    position,
    rateCardId,
    unit,
    value,
  };
}
