import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { DotMatrixLoadingState } from "#/components/ui/dot-matrix-loader";

import type { ActiveOrganizationSync } from "./organization-access";
import { synchronizeClientActiveOrganization } from "./organization-access";

interface OrganizationActiveSyncBoundaryProps {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly children: ReactNode;
}

type SyncState = "ready" | "syncing" | "error";

export function OrganizationActiveSyncBoundary({
  activeOrganizationSync,
  children,
}: OrganizationActiveSyncBoundaryProps) {
  const router = useRouter();
  const { required, targetOrganizationId } = activeOrganizationSync;
  const [retryCount, setRetryCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>(
    required ? "syncing" : "ready"
  );

  useEffect(() => {
    let cancelled = false;

    if (!required) {
      setSyncState("ready");
      return () => {
        cancelled = true;
      };
    }

    setSyncState("syncing");

    void (async () => {
      try {
        await synchronizeClientActiveOrganization({
          required,
          targetOrganizationId,
        });
        await router.invalidate({ sync: true });

        if (!cancelled) {
          setSyncState("ready");
        }
      } catch {
        if (!cancelled) {
          setSyncState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [required, retryCount, router, targetOrganizationId]);

  if (syncState === "syncing") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10 text-center">
        <DotMatrixLoadingState label="Loading your organization" />
      </div>
    );
  }

  if (syncState === "error") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm">
        <p className="text-destructive">
          We couldn&apos;t load your organization.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRetryCount((currentCount) => currentCount + 1)}
        >
          Try again
        </Button>
      </div>
    );
  }

  return children;
}
