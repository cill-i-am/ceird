import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

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
  }, [required, router, targetOrganizationId]);

  if (syncState === "syncing") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
        Loading your organization...
      </main>
    );
  }

  if (syncState === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10 text-center text-sm text-destructive">
        We couldn&apos;t load your organization. Refresh and try again.
      </main>
    );
  }

  return children;
}
