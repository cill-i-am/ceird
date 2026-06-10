import type { OrganizationId } from "@ceird/identity-core";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { createDataPlaneSeed } from "./bootstrap";
import { createOrganizationDataScope } from "./query-scope";
import {
  DataPlaneProvider,
  getDataPlaneSessionKey,
  useApplyDataPlaneSeeds,
  useDataPlaneSession,
  useOptionalDataPlaneSession,
} from "./session";

describe("data-plane session", () => {
  it("creates one scoped session using the provided query client", () => {
    const queryClient = new QueryClient();
    const scope = createOrganizationDataScope({
      organizationId: "org_123" as OrganizationId,
      role: "owner",
      userId: "user_123",
    });

    render(
      <DataPlaneProvider queryClient={queryClient} scope={scope}>
        <SessionProbe />
      </DataPlaneProvider>
    );

    expect(screen.getByTestId("session-key")).toHaveTextContent(
      "organization:org_123:user:user_123:role:owner"
    );
    expect(screen.getByTestId("query-client")).toHaveTextContent("provided");
    expect(screen.getByTestId("mutation-journal")).toHaveTextContent(
      "provided"
    );
  });

  it("replaces the registry when organization scope changes", () => {
    const queryClient = new QueryClient();
    const seenRegistries: unknown[] = [];
    const { rerender } = render(
      <DataPlaneProvider
        queryClient={queryClient}
        scope={createOrganizationDataScope({
          organizationId: "org_123" as OrganizationId,
          role: "owner",
          userId: "user_123",
        })}
      >
        <RegistryProbe seenRegistries={seenRegistries} />
      </DataPlaneProvider>
    );

    rerender(
      <DataPlaneProvider
        queryClient={queryClient}
        scope={createOrganizationDataScope({
          organizationId: "org_456" as OrganizationId,
          role: "owner",
          userId: "user_123",
        })}
      >
        <RegistryProbe seenRegistries={seenRegistries} />
      </DataPlaneProvider>
    );

    expect(seenRegistries).toHaveLength(2);
    expect(seenRegistries[0]).not.toBe(seenRegistries[1]);
  });

  it("applies seed envelopes without replacing newer cache data", () => {
    const queryClient = new QueryClient();
    const queryKey = ["jobs", "organization", "org_123"] as const;
    queryClient.setQueryData(queryKey, [{ id: "newer" }], {
      updatedAt: 1001,
    });

    render(
      <DataPlaneProvider
        queryClient={queryClient}
        scope={createOrganizationDataScope({
          organizationId: "org_123" as OrganizationId,
        })}
      >
        <SeedProbe
          seeds={[
            createDataPlaneSeed({
              collection: "jobs",
              completeness: "complete",
              data: [{ id: "stale-loader" }],
              queryKey,
              requestStartedAt: 1000,
            }),
          ]}
        />
      </DataPlaneProvider>
    );

    expect(queryClient.getQueryData(queryKey)).toStrictEqual([{ id: "newer" }]);
  });

  it("returns undefined from the optional hook outside a provider", () => {
    render(<OptionalProbe />);

    expect(screen.getByTestId("optional-session")).toHaveTextContent("missing");
  });

  it("fails closed for required hooks outside a provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      expect(() => render(<RequiredProbe />)).toThrow(
        /data plane session must be used inside dataplaneprovider/i
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

function SessionProbe() {
  const session = useDataPlaneSession();
  return (
    <>
      <div data-testid="session-key">
        {getDataPlaneSessionKey(session.scope)}
      </div>
      <div data-testid="query-client">
        {session.queryClient ? "provided" : "missing"}
      </div>
      <div data-testid="mutation-journal">
        {session.mutationJournal ? "provided" : "missing"}
      </div>
    </>
  );
}

function RegistryProbe({
  seenRegistries,
}: {
  readonly seenRegistries: unknown[];
}) {
  const session = useDataPlaneSession();
  seenRegistries.push(session.registry);
  return <div />;
}

function SeedProbe({
  seeds,
}: {
  readonly seeds: Parameters<typeof useApplyDataPlaneSeeds>[0];
}) {
  useApplyDataPlaneSeeds(seeds);
  return <div />;
}

function OptionalProbe() {
  const session = useOptionalDataPlaneSession();
  return (
    <div data-testid="optional-session">
      {session === undefined ? "missing" : "present"}
    </div>
  );
}

function RequiredProbe(): ReactNode {
  useDataPlaneSession();
  return null;
}
