"use client";
import type { SiteOption } from "@ceird/sites-core";
import * as React from "react";

interface WorkspaceSheetEventsContextValue {
  readonly notifySiteCreated: (site: SiteOption, targetId?: string) => void;
  readonly subscribeSiteCreated: (
    targetId: string,
    listener: (site: SiteOption) => void
  ) => () => void;
}

interface SiteCreatedListener {
  readonly listener: (site: SiteOption) => void;
  readonly targetId: string;
}

const WorkspaceSheetEventsContext =
  React.createContext<WorkspaceSheetEventsContextValue | null>(null);

export function WorkspaceSheetEventsProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const siteCreatedListenersRef = React.useRef(new Set<SiteCreatedListener>());
  const value = React.useMemo<WorkspaceSheetEventsContextValue>(
    () => ({
      notifySiteCreated: (site, targetId) => {
        if (targetId === undefined) {
          return;
        }

        for (const subscription of siteCreatedListenersRef.current) {
          if (subscription.targetId === targetId) {
            subscription.listener(site);
          }
        }
      },
      subscribeSiteCreated: (targetId, listener) => {
        const subscription = { listener, targetId };

        siteCreatedListenersRef.current.add(subscription);

        return () => {
          siteCreatedListenersRef.current.delete(subscription);
        };
      },
    }),
    []
  );

  return (
    <WorkspaceSheetEventsContext.Provider value={value}>
      {children}
    </WorkspaceSheetEventsContext.Provider>
  );
}

export function useNotifyWorkspaceSheetSiteCreated() {
  return useWorkspaceSheetEventsContext().notifySiteCreated;
}

export function useWorkspaceSheetSiteCreated(
  targetId: string,
  listener: (site: SiteOption) => void
) {
  const { subscribeSiteCreated } = useWorkspaceSheetEventsContext();

  React.useEffect(
    () => subscribeSiteCreated(targetId, listener),
    [listener, subscribeSiteCreated, targetId]
  );
}

function useWorkspaceSheetEventsContext() {
  const context = React.useContext(WorkspaceSheetEventsContext);

  if (!context) {
    throw new Error(
      "Workspace sheet events must be used inside WorkspaceSheetEventsProvider."
    );
  }

  return context;
}
