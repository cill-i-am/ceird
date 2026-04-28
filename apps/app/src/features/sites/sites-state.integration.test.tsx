/* oxlint-disable vitest/prefer-import-in-mock */
import {
  RegistryProvider,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  CreateSiteInput,
  CreateSiteResponse,
  SiteIdType,
  UpdateSiteInput,
  UpdateSiteResponse,
} from "@task-tracker/jobs-core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import type * as EffectPackage from "effect";

import {
  jobsOptionsStateAtom,
  seedJobsOptionsState,
} from "#/features/jobs/jobs-state";

import {
  createSiteMutationAtom,
  sitesNoticeAtom,
  updateSiteMutationAtomFamily,
} from "./sites-state";

type EffectClientMock = (...args: unknown[]) => unknown;

const organizationId = decodeOrganizationId("org_123");
const existingSiteId = "11111111-1111-4111-8111-111111111111" as SiteIdType;
const createdSiteId = "22222222-2222-4222-8222-222222222222" as SiteIdType;

const {
  mockedCreateSite,
  mockedGetSiteOptions,
  mockedMakeBrowserJobsClient,
  mockedUpdateSite,
} = vi.hoisted(() => ({
  mockedCreateSite: vi.fn<EffectClientMock>(),
  mockedGetSiteOptions: vi.fn<EffectClientMock>(),
  mockedMakeBrowserJobsClient: vi.fn<EffectClientMock>(),
  mockedUpdateSite: vi.fn<EffectClientMock>(),
}));

vi.mock("#/features/jobs/jobs-client", async () => {
  const { Effect: EffectModule } =
    await vi.importActual<typeof EffectPackage>("effect");

  return {
    makeBrowserJobsClient: mockedMakeBrowserJobsClient,
    provideBrowserJobsHttp: (effect: unknown) => effect,
    runBrowserJobsRequest: (
      _operation: string,
      execute: (client: unknown) => unknown
    ) =>
      (mockedMakeBrowserJobsClient() as Effect.Effect<unknown, unknown>).pipe(
        EffectModule.flatMap(
          (client) => execute(client) as Effect.Effect<unknown, unknown>
        )
      ),
  };
});

describe("sites state integration", () => {
  beforeEach(() => {
    mockedCreateSite.mockReset();
    mockedGetSiteOptions.mockReset();
    mockedMakeBrowserJobsClient.mockReset();
    mockedUpdateSite.mockReset();

    mockedMakeBrowserJobsClient.mockImplementation(() =>
      Effect.succeed({
        sites: {
          createSite: mockedCreateSite,
          getSiteOptions: mockedGetSiteOptions,
          updateSite: mockedUpdateSite,
        },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "uses refreshed site options after creating a site",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateSite.mockReturnValue(
        Effect.succeed(buildSite(createdSiteId, "Draft Site"))
      );
      mockedGetSiteOptions.mockReturnValue(
        Effect.succeed({
          serviceAreas: [],
          sites: [
            buildSite(existingSiteId, "Existing Site"),
            buildSite(createdSiteId, "Canonical Site"),
          ],
        })
      );

      const user = userEvent.setup();
      renderSitesStateProbe();

      await user.click(screen.getByRole("button", { name: "Create site" }));

      await waitFor(() => {
        expect(screen.getByTestId("site-names")).toHaveTextContent(
          "Existing Site | Canonical Site"
        );
      });
      expect(mockedGetSiteOptions).toHaveBeenCalledOnce();
      expect(screen.getByTestId("notice")).toHaveTextContent(
        "created:Draft Site"
      );
    }
  );

  it(
    "optimistically upserts an updated site when options refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedUpdateSite.mockReturnValue(
        Effect.succeed(buildSite(existingSiteId, "Updated Site"))
      );
      mockedGetSiteOptions.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderSitesStateProbe();

      await user.click(screen.getByRole("button", { name: "Update site" }));

      await waitFor(() => {
        expect(screen.getByTestId("site-names")).toHaveTextContent(
          "Updated Site"
        );
      });
      expect(mockedGetSiteOptions).toHaveBeenCalledOnce();
      expect(screen.getByTestId("notice")).toHaveTextContent(
        "updated:Updated Site"
      );
    }
  );
});

function renderSitesStateProbe() {
  return render(
    <RegistryProvider
      initialValues={[
        [
          jobsOptionsStateAtom,
          seedJobsOptionsState(organizationId, {
            contacts: [],
            members: [],
            serviceAreas: [],
            sites: [buildSite(existingSiteId, "Existing Site")],
          }),
        ],
      ]}
    >
      <SitesStateProbe />
    </RegistryProvider>
  );
}

function SitesStateProbe() {
  const createSite = useAtomSet(createSiteMutationAtom, {
    mode: "promiseExit",
  });
  const updateSite = useAtomSet(updateSiteMutationAtomFamily(existingSiteId), {
    mode: "promiseExit",
  });
  const options = useAtomValue(jobsOptionsStateAtom).data;
  const notice = useAtomValue(sitesNoticeAtom);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void createSite(buildCreateSiteInput("Draft Site"));
        }}
      >
        Create site
      </button>
      <button
        type="button"
        onClick={() => {
          void updateSite(buildUpdateSiteInput("Updated Site"));
        }}
      >
        Update site
      </button>
      <output data-testid="site-names">
        {options.sites.map((site) => site.name).join(" | ")}
      </output>
      <output data-testid="notice">
        {notice ? `${notice.kind}:${notice.name}` : ""}
      </output>
    </div>
  );
}

function buildCreateSiteInput(name: string): CreateSiteInput {
  return {
    addressLine1: "1 Custom House Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    name,
  };
}

function buildUpdateSiteInput(name: string): UpdateSiteInput {
  return {
    addressLine1: "1 Custom House Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    name,
  };
}

function buildSite(
  id: SiteIdType,
  name: string
): CreateSiteResponse & UpdateSiteResponse {
  return {
    addressLine1: "1 Custom House Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    geocodedAt: "2026-04-27T10:00:00.000Z",
    geocodingProvider: "stub",
    id,
    latitude: 53.3498,
    longitude: -6.2603,
    name,
  };
}
