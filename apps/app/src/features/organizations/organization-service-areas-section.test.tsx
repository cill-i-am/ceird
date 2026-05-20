import type { OrganizationId } from "@ceird/identity-core";
import type { ServiceArea, ServiceAreaIdType } from "@ceird/sites-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import type * as EffectPackage from "effect";

import { OrganizationConfigurationProvider } from "./organization-configuration-state";
import { OrganizationServiceAreasSection } from "./organization-service-areas-section";

type EffectClientMock = (...args: unknown[]) => unknown;

const serviceAreaId =
  "11111111-1111-4111-8111-111111111111" as ServiceAreaIdType;
const secondServiceAreaId =
  "22222222-2222-4222-8222-222222222222" as ServiceAreaIdType;
const organizationId = "team_111111111111111111111111" as OrganizationId;

const {
  mockedCreateServiceArea,
  mockedListServiceAreas,
  mockedMakeBrowserAppApiClient,
  mockedUpdateServiceArea,
} = vi.hoisted(() => ({
  mockedCreateServiceArea: vi.fn<EffectClientMock>(),
  mockedListServiceAreas: vi.fn<EffectClientMock>(),
  mockedMakeBrowserAppApiClient: vi.fn<EffectClientMock>(),
  mockedUpdateServiceArea: vi.fn<EffectClientMock>(),
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

describe("organization service areas section", () => {
  beforeEach(() => {
    mockedCreateServiceArea.mockReset();
    mockedListServiceAreas.mockReset();
    mockedMakeBrowserAppApiClient.mockReset();
    mockedUpdateServiceArea.mockReset();

    mockedListServiceAreas.mockReturnValue(
      Effect.succeed({
        items: [buildServiceArea("Dublin", "North and city centre")],
      })
    );
    mockedCreateServiceArea.mockReturnValue(
      Effect.succeed(buildServiceArea("Northside", "Emergency coverage"))
    );
    mockedUpdateServiceArea.mockReturnValue(
      Effect.succeed(buildServiceArea("Dublin Core", "City centre"))
    );
    mockedMakeBrowserAppApiClient.mockImplementation(() =>
      Effect.succeed({
        serviceAreas: {
          createServiceArea: mockedCreateServiceArea,
          listServiceAreas: mockedListServiceAreas,
          updateServiceArea: mockedUpdateServiceArea,
        },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lets admins see service areas", async () => {
    renderServiceAreasSection();

    await expect(
      screen.findByRole("heading", { name: "Service areas" })
    ).resolves.toBeVisible();
    expect(
      screen.queryByText(
        "Maintain the named areas used for sites, filtering, and team planning."
      )
    ).not.toBeInTheDocument();
    await expect(screen.findByText("Dublin")).resolves.toBeVisible();
  });

  it("creates a service area through the jobs client group", async () => {
    const user = userEvent.setup();
    renderServiceAreasSection();

    await screen.findByText("Dublin");
    await user.type(
      screen.getByLabelText("New service area name"),
      "Northside"
    );
    await user.type(
      screen.getByLabelText("New service area description"),
      "Emergency coverage"
    );
    await user.click(screen.getByRole("button", { name: "Add service area" }));

    await waitFor(() => {
      expect(mockedCreateServiceArea).toHaveBeenCalledWith({
        payload: {
          description: "Emergency coverage",
          name: "Northside",
        },
      });
    });
  });

  it("keeps local service area mutations when an older list response resolves later", async () => {
    const serviceAreasResponse = createDeferredServiceAreasResponse();
    mockedListServiceAreas.mockReturnValue(
      Effect.promise(() => serviceAreasResponse.promise)
    );
    mockedCreateServiceArea.mockReturnValue(
      Effect.succeed(
        buildServiceArea("Northside", "Emergency coverage", secondServiceAreaId)
      )
    );
    const user = userEvent.setup();
    renderServiceAreasSection();

    await screen.findByRole("heading", { name: "Service areas" });
    await user.type(
      screen.getByLabelText("New service area name"),
      "Northside"
    );
    await user.type(
      screen.getByLabelText("New service area description"),
      "Emergency coverage"
    );
    await user.click(screen.getByRole("button", { name: /Add service area/ }));

    await expect(screen.findByText("Northside")).resolves.toBeVisible();

    act(() => {
      serviceAreasResponse.resolve({
        items: [buildServiceArea("Dublin", "North and city centre")],
      });
    });

    await expect(screen.findByText("Dublin")).resolves.toBeVisible();
    expect(screen.getByText("Northside")).toBeVisible();
  });

  it("prefers server rows when a list response includes a local service area id", async () => {
    const serviceAreasResponse = createDeferredServiceAreasResponse();
    mockedListServiceAreas.mockReturnValue(
      Effect.promise(() => serviceAreasResponse.promise)
    );
    mockedCreateServiceArea.mockReturnValue(
      Effect.succeed(
        buildServiceArea("Local draft", "Pending local value", serviceAreaId)
      )
    );
    const user = userEvent.setup();
    renderServiceAreasSection();

    await screen.findByRole("heading", { name: "Service areas" });
    await user.type(
      screen.getByLabelText("New service area name"),
      "Local draft"
    );
    await user.click(screen.getByRole("button", { name: /Add service area/ }));

    await expect(screen.findByText("Local draft")).resolves.toBeVisible();

    act(() => {
      serviceAreasResponse.resolve({
        items: [
          buildServiceArea(
            "Server canonical",
            "Fresh server value",
            serviceAreaId
          ),
        ],
      });
    });

    await expect(screen.findByText("Server canonical")).resolves.toBeVisible();
    expect(screen.queryByText("Local draft")).not.toBeInTheDocument();
  });

  it("edits a service area through the jobs client group", async () => {
    const user = userEvent.setup();
    renderServiceAreasSection();

    const area = await screen.findByRole("article", {
      name: "Service area Dublin",
    });
    await user.click(
      within(area).getByRole("button", {
        name: "Service area actions for Dublin",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Edit service area" })
    );
    await user.clear(within(area).getByLabelText("Area name for Dublin"));
    await user.type(
      within(area).getByLabelText("Area name for Dublin"),
      "Dublin Core"
    );
    await user.clear(within(area).getByLabelText("Description for Dublin"));
    await user.type(
      within(area).getByLabelText("Description for Dublin"),
      "City centre"
    );
    await user.click(within(area).getByRole("button", { name: "Save Dublin" }));

    await waitFor(() => {
      expect(mockedUpdateServiceArea).toHaveBeenCalledWith({
        params: {
          serviceAreaId,
        },
        payload: {
          description: "City centre",
          name: "Dublin Core",
        },
      });
    });
  });

  it("clears a service area description through the jobs client group", async () => {
    const user = userEvent.setup();
    renderServiceAreasSection();

    const area = await screen.findByRole("article", {
      name: "Service area Dublin",
    });
    await user.click(
      within(area).getByRole("button", {
        name: "Service area actions for Dublin",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Edit service area" })
    );
    await user.clear(within(area).getByLabelText("Description for Dublin"));
    await user.click(within(area).getByRole("button", { name: "Save Dublin" }));

    await waitFor(() => {
      expect(mockedUpdateServiceArea).toHaveBeenCalledWith({
        params: {
          serviceAreaId,
        },
        payload: {
          description: null,
          name: "Dublin",
        },
      });
    });
  });

  it("resets a canceled service area edit when editing starts again", async () => {
    const user = userEvent.setup();
    renderServiceAreasSection();

    const area = await screen.findByRole("article", {
      name: "Service area Dublin",
    });
    await user.click(
      within(area).getByRole("button", {
        name: "Service area actions for Dublin",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Edit service area" })
    );
    await user.clear(within(area).getByLabelText("Area name for Dublin"));
    await user.type(
      within(area).getByLabelText("Area name for Dublin"),
      "Draft area"
    );

    await user.click(within(area).getByRole("button", { name: "Cancel" }));
    expect(within(area).queryByLabelText("Area name for Dublin")).toBeNull();

    await user.click(
      within(area).getByRole("button", {
        name: "Service area actions for Dublin",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Edit service area" })
    );

    expect(within(area).getByLabelText("Area name for Dublin")).toHaveValue(
      "Dublin"
    );
  });
});

function renderServiceAreasSection() {
  return render(
    <OrganizationConfigurationProvider organizationId={organizationId}>
      <OrganizationServiceAreasSection />
    </OrganizationConfigurationProvider>
  );
}

function createDeferredServiceAreasResponse() {
  const { promise, resolve } = (
    Promise as unknown as {
      withResolvers: <Value>() => {
        promise: Promise<Value>;
        reject: (reason?: unknown) => void;
        resolve: (value: Value) => void;
      };
    }
  ).withResolvers<{ readonly items: readonly ServiceArea[] }>();

  return { promise, resolve };
}

function buildServiceArea(
  name: string,
  description?: string | undefined,
  id: ServiceAreaIdType = serviceAreaId
): ServiceArea {
  return {
    description,
    id,
    name,
  };
}
