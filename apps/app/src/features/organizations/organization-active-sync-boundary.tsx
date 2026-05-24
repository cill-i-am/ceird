import type { OrganizationId } from "@ceird/identity-core";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useReducer } from "react";

import { Button } from "#/components/ui/button";
import { DotMatrixLoadingState } from "#/components/ui/dot-matrix-loader";

import { synchronizeClientActiveOrganization } from "./organization-access";
import type { ActiveOrganizationSync } from "./organization-route-access";

interface OrganizationActiveSyncBoundaryProps {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly children: ReactNode;
}

type SyncState = "ready" | "syncing" | "error";

interface OrganizationSyncState {
  readonly completedTargetOrganizationId?: OrganizationId | null | undefined;
  readonly retryCount: number;
  readonly status: SyncState;
}

type OrganizationSyncAction =
  | {
      readonly targetOrganizationId?: OrganizationId | null | undefined;
      readonly type: "ready";
    }
  | { readonly type: "syncing" }
  | { readonly type: "error" }
  | { readonly type: "retry" };

function setSyncStatus(
  state: OrganizationSyncState,
  status: SyncState
): OrganizationSyncState {
  return state.status === status ? state : { ...state, status };
}

function organizationSyncReducer(
  state: OrganizationSyncState,
  action: OrganizationSyncAction
): OrganizationSyncState {
  switch (action.type) {
    case "ready": {
      return {
        completedTargetOrganizationId: action.targetOrganizationId,
        retryCount: state.retryCount,
        status: "ready",
      };
    }
    case "syncing": {
      return setSyncStatus(state, "syncing");
    }
    case "error": {
      return setSyncStatus(state, "error");
    }
    case "retry": {
      return {
        retryCount: state.retryCount + 1,
        status: "syncing",
      };
    }
    default: {
      action satisfies never;
      return state;
    }
  }
}

export function OrganizationActiveSyncBoundary({
  activeOrganizationSync,
  children,
}: OrganizationActiveSyncBoundaryProps) {
  const router = useRouter();
  const { required, targetOrganizationId } = activeOrganizationSync;
  const [syncState, dispatchSyncState] = useReducer(organizationSyncReducer, {
    completedTargetOrganizationId: undefined,
    retryCount: 0,
    status: required ? "syncing" : "ready",
  });
  const renderStatus =
    required &&
    syncState.status === "ready" &&
    syncState.completedTargetOrganizationId !== targetOrganizationId
      ? "syncing"
      : syncState.status;

  useEffect(() => {
    let cancelled = false;

    if (!required) {
      dispatchSyncState({ type: "ready" });
      return () => {
        cancelled = true;
      };
    }

    dispatchSyncState({ type: "syncing" });

    void (async () => {
      try {
        await synchronizeClientActiveOrganization({
          required,
          targetOrganizationId,
        });
        await router.invalidate({ sync: true });

        if (!cancelled) {
          dispatchSyncState({ targetOrganizationId, type: "ready" });
        }
      } catch {
        if (!cancelled) {
          dispatchSyncState({ type: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [required, syncState.retryCount, router, targetOrganizationId]);

  if (renderStatus === "syncing") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10 text-center">
        <DotMatrixLoadingState label="Loading your organization" />
      </div>
    );
  }

  if (renderStatus === "error") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm">
        <p className="text-destructive">
          We couldn&apos;t load your organization.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dispatchSyncState({ type: "retry" })}
        >
          Try again
        </Button>
      </div>
    );
  }

  return children;
}
