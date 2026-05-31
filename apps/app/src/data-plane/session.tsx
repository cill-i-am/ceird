"use client";
import type { QueryClient } from "@tanstack/react-query";
import { use } from "react";
import * as React from "react";

import { applyDataPlaneSeeds } from "./bootstrap";
import type { DataPlaneSeed } from "./bootstrap";
import { createDataPlaneMutationJournal } from "./mutation-journal";
import type { DataPlaneMutationJournal } from "./mutation-journal";
import type { OrganizationDataScope } from "./query-scope";

export interface DataPlaneSession {
  readonly mutationJournal: DataPlaneMutationJournal;
  readonly queryClient: QueryClient;
  readonly registry: Map<string, unknown>;
  readonly scope: OrganizationDataScope;
}

const DataPlaneSessionContext = React.createContext<DataPlaneSession | null>(
  null
);

const EMPTY_DATA_PLANE_SEEDS: readonly DataPlaneSeed<unknown>[] = [];

export function getDataPlaneSessionKey(scope: OrganizationDataScope) {
  return [
    "organization",
    scope.organizationId,
    "user",
    scope.userId ?? "unknown",
    "role",
    scope.role ?? "unknown",
  ].join(":");
}

export function DataPlaneProvider({
  children,
  queryClient,
  scope,
  seeds = EMPTY_DATA_PLANE_SEEDS,
}: {
  readonly children: React.ReactNode;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly seeds?: readonly DataPlaneSeed<unknown>[] | undefined;
}) {
  const { organizationId, role, userId } = scope;

  React.useEffect(() => {
    applyDataPlaneSeeds(queryClient, seeds);
  }, [queryClient, seeds]);

  const session = React.useMemo<DataPlaneSession>(
    () => ({
      mutationJournal: createDataPlaneMutationJournal(),
      queryClient,
      registry: new Map<string, unknown>(),
      scope: {
        organizationId,
        role,
        userId,
      },
    }),
    [organizationId, queryClient, role, userId]
  );

  return (
    <DataPlaneSessionContext.Provider value={session}>
      {children}
    </DataPlaneSessionContext.Provider>
  );
}

export function useOptionalDataPlaneSession() {
  return use(DataPlaneSessionContext) ?? undefined;
}

export function useDataPlaneSession() {
  const session = useOptionalDataPlaneSession();

  if (!session) {
    throw new Error(
      "Data plane session must be used inside DataPlaneProvider."
    );
  }

  return session;
}

export function useApplyDataPlaneSeeds(
  seeds: readonly DataPlaneSeed<unknown>[]
) {
  const session = useOptionalDataPlaneSession();

  React.useEffect(() => {
    if (!session) {
      return;
    }

    applyDataPlaneSeeds(session.queryClient, seeds);
  }, [seeds, session]);
}
