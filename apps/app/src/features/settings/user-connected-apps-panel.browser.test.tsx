import {
  decodeDisconnectConnectedAppGrantInput,
  decodeOrganizationId,
} from "@ceird/identity-core";
import type {
  ConnectedAppGrant,
  ConnectedAppGrantId,
} from "@ceird/identity-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserConnectedAppsPanel } from "./user-connected-apps-panel";

const { mockedDisconnectConnectedAppGrant, mockedListConnectedAppGrants } =
  vi.hoisted(() => ({
    mockedDisconnectConnectedAppGrant: vi.fn<
      (input: { readonly grantId: ConnectedAppGrantId }) => Promise<{
        readonly disconnectedGrantId: ConnectedAppGrantId;
      }>
    >(),
    mockedListConnectedAppGrants:
      vi.fn<() => Promise<{ readonly grants: readonly ConnectedAppGrant[] }>>(),
  }));

vi.mock(import("./user-connected-apps-api"), () => ({
  disconnectConnectedAppGrant: mockedDisconnectConnectedAppGrant,
  listConnectedAppGrants: mockedListConnectedAppGrants,
}));

describe("user connected apps panel", () => {
  const externalMcpGrant = makeConnectedAppGrant();

  beforeEach(() => {
    mockedDisconnectConnectedAppGrant.mockResolvedValue({
      disconnectedGrantId: externalMcpGrant.grantId,
    });
    mockedListConnectedAppGrants.mockResolvedValue({
      grants: [externalMcpGrant],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a stable loading state before connected apps resolve", async () => {
    const listResult = createDeferred<{
      readonly grants: readonly ConnectedAppGrant[];
    }>();
    mockedListConnectedAppGrants.mockReturnValueOnce(listResult.promise);

    render(<UserConnectedAppsPanel />);

    expect(screen.getByText("Loading connected apps…")).toBeInTheDocument();

    listResult.resolve({ grants: [externalMcpGrant] });

    await expect(screen.findByText("External MCP")).resolves.toBeVisible();
  });

  it("lists connected apps without exposing raw token material", async () => {
    render(<UserConnectedAppsPanel />);

    const appText = await screen.findByText("External MCP");
    const row = getRequiredElement(appText.closest("li"));

    expect(within(row).getByText("Acme Field Ops")).toBeVisible();
    expect(within(row).getByText("Offline access")).toBeVisible();
    expect(within(row).getByText("mcp.example.com")).toBeVisible();
    expect(within(row).getByText("2 active tokens")).toBeVisible();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });

  it("disconnects a connected app after inline confirmation", async () => {
    const interaction = userEvent.setup();

    render(<UserConnectedAppsPanel />);

    const appText = await screen.findByText("External MCP");
    const row = getRequiredElement(appText.closest("li"));

    await interaction.click(
      within(row).getByRole("button", { name: "Disconnect app" })
    );

    expect(within(row).getByText("Disconnect this app?")).toBeVisible();

    mockedListConnectedAppGrants.mockResolvedValueOnce({ grants: [] });

    await interaction.click(
      within(row).getByRole("button", { name: "Disconnect app" })
    );

    await waitFor(() => {
      expect(mockedDisconnectConnectedAppGrant).toHaveBeenCalledWith({
        grantId: externalMcpGrant.grantId,
      });
    });
    await expect(
      screen.findByText("Connected app disconnected.")
    ).resolves.toHaveAttribute("role", "status");
    expect(screen.queryByText("External MCP")).not.toBeInTheDocument();
  });

  it("shows empty and error states with retry actions", async () => {
    const interaction = userEvent.setup();
    mockedListConnectedAppGrants.mockResolvedValueOnce({ grants: [] });

    render(<UserConnectedAppsPanel />);

    await expect(
      screen.findByText("No connected apps yet.")
    ).resolves.toBeVisible();

    mockedListConnectedAppGrants.mockRejectedValueOnce(new Error("offline"));
    await interaction.click(screen.getByRole("button", { name: "Refresh" }));

    await expect(
      screen.findByText("We couldn't load connected apps. Please try again.")
    ).resolves.toBeVisible();

    mockedListConnectedAppGrants.mockResolvedValueOnce({
      grants: [externalMcpGrant],
    });
    await interaction.click(screen.getByRole("button", { name: "Try again" }));

    await expect(screen.findByText("External MCP")).resolves.toBeVisible();
  });
});

function makeConnectedAppGrant(): ConnectedAppGrant {
  const { grantId } = decodeDisconnectConnectedAppGrantInput({
    grantId: "consent_123",
  });

  return {
    activeAccessTokenCount: 1,
    activeRefreshTokenCount: 1,
    clientId: "client_external_mcp",
    clientName: "External MCP",
    clientUri: "https://mcp.example.com",
    context: {
      organizationId: decodeOrganizationId("org_acme"),
      organizationName: "Acme Field Ops",
      type: "organization",
    },
    grantId,
    grantedAt: "2026-06-08T10:30:00.000Z",
    latestAccessTokenExpiresAt: "2026-06-08T11:30:00.000Z",
    latestRefreshTokenExpiresAt: "2026-07-08T10:30:00.000Z",
    offlineAccess: true,
    redirectHosts: ["mcp.example.com"],
    scopes: ["openid", "profile", "ceird:read", "offline_access"],
    scopeGroups: [
      { key: "identity", label: "Identity", scopes: ["openid", "profile"] },
      { key: "read", label: "Read", scopes: ["ceird:read"] },
      { key: "offline", label: "Offline access", scopes: ["offline_access"] },
    ],
    updatedAt: "2026-06-08T10:45:00.000Z",
  };
}

function getRequiredElement<ElementType extends Element>(
  element: ElementType | null
): ElementType {
  if (element === null) {
    throw new Error("Expected element to exist.");
  }

  return element;
}

function createDeferred<Value = unknown>() {
  const { promise, resolve } = (
    Promise as unknown as {
      withResolvers: <Value>() => {
        promise: Promise<Value>;
        resolve: (value: Value) => void;
      };
    }
  ).withResolvers<Value>();

  return {
    promise,
    resolve,
  };
}
