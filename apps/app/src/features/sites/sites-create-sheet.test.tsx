/* oxlint-disable vitest/prefer-import-in-mock */
import {
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  SiteGeocodingFailedError,
} from "@task-tracker/jobs-core";
import type { ServiceAreaIdType, SiteIdType } from "@task-tracker/jobs-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exit } from "effect";
import type { ReactNode } from "react";

import { jobsOptionsStateAtom } from "#/features/jobs/jobs-state";

import { SitesCreateSheet } from "./sites-create-sheet";
import { createSiteMutationAtom } from "./sites-state";

type AsyncMutationMock = (...args: unknown[]) => Promise<unknown>;
type AtomSetterMock = (atom: unknown) => unknown;
type AtomValueMock = (atom: unknown) => unknown;
type NavigateMock = (...args: unknown[]) => unknown;

const serviceAreaId =
  "33333333-3333-4333-8333-333333333333" as ServiceAreaIdType;
const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;

const { mockedNavigate, mockedUseAtomSet, mockedUseAtomValue } = vi.hoisted(
  () => ({
    mockedNavigate: vi.fn<NavigateMock>(),
    mockedUseAtomSet: vi.fn<AtomSetterMock>(),
    mockedUseAtomValue: vi.fn<AtomValueMock>(),
  })
);

const mockedCreateSite = vi.fn<AsyncMutationMock>();
let mockedCreateResult: unknown;

vi.mock(import("@effect-atom/atom-react"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Result: {
      builder: (result: unknown) => ({
        onError: (renderError: (error: { message: string }) => ReactNode) => ({
          render: () => {
            if (
              typeof result === "object" &&
              result !== null &&
              "error" in result
            ) {
              return renderError(result.error as { message: string });
            }

            return null;
          },
        }),
      }),
    } as never,
    useAtomSet: mockedUseAtomSet as never,
    useAtomValue: mockedUseAtomValue as never,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockedNavigate,
}));

vi.mock("#/components/ui/drawer", () => ({
  DrawerContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    open,
  }: {
    children: ReactNode;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="responsive-drawer" data-open="true">
        {children}
      </div>
    ) : null,
}));

describe("sites create sheet", () => {
  beforeEach(() => {
    mockedCreateSite.mockReset();
    mockedNavigate.mockReset();
    mockedCreateResult = {
      waiting: false,
    };

    mockedUseAtomSet.mockImplementation((atom: unknown) => {
      if (atom === createSiteMutationAtom) {
        return mockedCreateSite;
      }

      return vi.fn<() => void>();
    });

    mockedUseAtomValue.mockImplementation((atom: unknown) => {
      if (atom === createSiteMutationAtom) {
        return mockedCreateResult;
      }

      if (atom === jobsOptionsStateAtom) {
        return {
          data: {
            contacts: [],
            members: [],
            serviceAreas: [
              {
                id: serviceAreaId,
                name: "Dublin",
              },
            ],
            sites: [],
          },
          organizationId: "org_123",
        };
      }

      return null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "submits standalone site details and returns to the sites section",
    { timeout: 10_000 },
    async () => {
      mockedCreateSite.mockResolvedValue(
        Exit.succeed({
          id: siteId,
          name: "Docklands Campus",
        })
      );

      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      expect(
        screen.queryByLabelText(new RegExp(`^Lat${"itude"}$`))
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(new RegExp(`^Long${"itude"}$`))
      ).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
      await user.click(screen.getByLabelText("Service area"));
      await user.click(screen.getByRole("option", { name: "Dublin" }));
      await user.type(
        screen.getByLabelText("Address line 1"),
        "1 Custom House Quay"
      );
      await user.type(screen.getByLabelText("Town"), "Dublin");
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D01 X2X2");
      await user.click(screen.getByRole("button", { name: /create site/i }));

      expect(mockedCreateSite).toHaveBeenCalledWith({
        addressLine1: "1 Custom House Quay",
        county: "Dublin",
        country: "IE",
        eircode: "D01 X2X2",
        name: "Docklands Campus",
        serviceAreaId,
        town: "Dublin",
      });
      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/sites" });
    }
  );

  it(
    "validates the required name and address details before submitting",
    { timeout: 10_000 },
    async () => {
      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      await user.click(screen.getByRole("button", { name: /create site/i }));

      expect(
        screen.getByText("Add a site name before creating it.")
      ).toBeInTheDocument();
      expect(screen.getByText("Add address line 1.")).toBeInTheDocument();
      expect(screen.getByText("Add county.")).toBeInTheDocument();
      expect(screen.getByText("Add Eircode.")).toBeInTheDocument();
      expect(mockedCreateSite).not.toHaveBeenCalled();
    }
  );

  it(
    "locks close controls while creation is waiting",
    { timeout: 10_000 },
    () => {
      mockedCreateResult = {
        waiting: true,
      };

      render(<SitesCreateSheet />);

      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
    }
  );

  it(
    "maps stale service area failures to the field without a duplicate alert",
    { timeout: 10_000 },
    async () => {
      mockedCreateSite.mockResolvedValue(
        Exit.fail({
          _tag: SERVICE_AREA_NOT_FOUND_ERROR_TAG,
          message: "Service area is no longer available.",
        })
      );

      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
      await user.click(screen.getByLabelText("Service area"));
      await user.click(screen.getByRole("option", { name: "Dublin" }));
      await user.type(
        screen.getByLabelText("Address line 1"),
        "1 Custom House Quay"
      );
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D01 X2X2");
      await user.click(screen.getByRole("button", { name: /create site/i }));

      const serviceAreaControl = screen.getByLabelText("Service area");

      expect(
        screen.getByText("Service area is no longer available.")
      ).toBeInTheDocument();
      expect(serviceAreaControl).toHaveAttribute("aria-invalid", "true");
      expect(serviceAreaControl).toHaveAttribute(
        "aria-describedby",
        "site-service-area-error"
      );
      expect(
        screen.queryByText("We couldn't create that site.")
      ).not.toBeInTheDocument();
    }
  );

  it(
    "maps geocoding failures to the Eircode field",
    { timeout: 10_000 },
    async () => {
      mockedCreateSite.mockResolvedValue(
        Exit.fail(
          new SiteGeocodingFailedError({
            country: "IE",
            eircode: "D01 X2X2",
            message:
              "We could not locate that site address. Check the Eircode and address details.",
          })
        )
      );

      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
      await user.type(
        screen.getByLabelText("Address line 1"),
        "1 Custom House Quay"
      );
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D01 X2X2");
      await user.click(screen.getByRole("button", { name: /create site/i }));

      const eircodeField = screen.getByLabelText("Eircode");

      expect(
        screen.getByText(
          "We could not locate that site address. Check the Eircode and address details."
        )
      ).toBeInTheDocument();
      expect(eircodeField).toHaveAttribute("aria-invalid", "true");
    }
  );

  it(
    "suppresses stale service area failures from the global result alert",
    { timeout: 10_000 },
    () => {
      mockedCreateResult = {
        error: {
          _tag: SERVICE_AREA_NOT_FOUND_ERROR_TAG,
          message: "Service area is no longer available.",
        },
        waiting: false,
      };

      render(<SitesCreateSheet />);

      expect(
        screen.queryByText("We couldn't create that site.")
      ).not.toBeInTheDocument();
    }
  );
});
